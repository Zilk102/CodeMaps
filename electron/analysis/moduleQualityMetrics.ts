/**
 * Measures every file of the graph for size, coupling and responsibility mix, and finds the worst
 * offenders (oversized modules, god files and classes, long or complex methods, mixed
 * responsibilities, clones).
 */

import { cloneIndex } from './clones/CloneIndex';
import { computeFileCoupling } from './couplingMetrics';
import { loadProjectConfig } from './projectConfig/configLoader';
import { structureLimitsOf, type StructureLimits } from './projectConfig/structureLimits';
import { isTestFile } from './testFiles';
import { GraphData, GraphNode } from '../store/types';
import {
  buildGraphAdjacency,
  getChildCodeSymbolCount,
  getFileLineCount,
  isContractSemanticLink,
  isDiRuntimeLink,
  isStackAwareLink,
} from './graphAnalysisUtils';
import {
  analyzeSourceFileStructure,
  type SourceClassMetric,
  type SourceFileMetrics,
  type SourceFunctionMetric,
} from './sourceFileStructure';

export { analyzeSourceFileStructure } from './sourceFileStructure';
export type {
  SourceClassMetric,
  SourceFileMetrics,
  SourceFunctionMetric,
} from './sourceFileStructure';

/**
 * Quality measurements of one file: line and symbol counts, coupling, links to frameworks, DI and
 * API contracts, parsed source metrics, and the derived responsibility count, mixed-responsibility
 * flag and design smell score. `lineCount` is null when the file cannot be read.
 */
export interface ModuleQualityMetric {
  node: GraphNode;
  lineCount: number | null;
  symbolCount: number;
  fanIn: number;
  fanOut: number;
  stackAwareDegree: number;
  diRuntimeDegree: number;
  contractDegree: number;
  sourceMetrics: SourceFileMetrics;
  responsibilityAxisCount: number;
  mixedResponsibilities: boolean;
  designSmellScore: number;
}

/**
 * All per-file metrics plus the top 10 files for each smell. Test files appear only in `metrics`;
 * clone groups come from the token-level detector when it has run, otherwise from identical
 * function bodies.
 */
export interface ModuleQualitySummary {
  metrics: ModuleQualityMetric[];
  /** The function limits the metrics were measured with; the built-in ones when absent. */
  limits?: StructureLimits;
  oversizedModules: ModuleQualityMetric[];
  godFiles: ModuleQualityMetric[];
  godClasses: Array<ModuleQualityMetric & { matchedClasses: SourceClassMetric[] }>;
  longMethods: Array<ModuleQualityMetric & { matchedMethods: SourceFunctionMetric[] }>;
  complexMethods: Array<ModuleQualityMetric & { matchedMethods: SourceFunctionMetric[] }>;
  mixedResponsibilityModules: ModuleQualityMetric[];
  codeClones: Array<{
    bodyHash: string;
    instances: Array<{
      nodeId: string;
      methodName: string;
      lineCount: number;
    }>;
  }>;
}

type BaseMetric = Omit<
  ModuleQualityMetric,
  'responsibilityAxisCount' | 'mixedResponsibilities' | 'designSmellScore'
>;

/** One named axis of responsibility and the test that says a module spans it. */
const RESPONSIBILITY_AXES: Array<[string, (metric: BaseMetric) => boolean]> = [
  ['fan_in', (metric) => metric.fanIn >= 6],
  ['fan_out', (metric) => metric.fanOut >= 10],
  ['symbol_density', (metric) => metric.symbolCount >= 20],
  ['module_size', (metric) => (metric.lineCount || 0) >= 500],
  ['oop_surface', (metric) => metric.sourceMetrics.classCount > 0],
  ['procedural_surface', (metric) => metric.sourceMetrics.topLevelFunctionCount >= 8],
  ['public_api_surface', (metric) => metric.sourceMetrics.publicMethodCount >= 8],
  ['stack_orchestration', (metric) => metric.stackAwareDegree > 0],
  ['runtime_di', (metric) => metric.diRuntimeDegree > 0],
  ['contract_binding', (metric) => metric.contractDegree > 0],
  ['high_churn', (metric) => metric.node.churn >= 10],
  ['long_methods', (metric) => metric.sourceMetrics.longMethods.length > 0],
  ['complex_methods', (metric) => metric.sourceMetrics.complexMethods.length > 0],
];

function createResponsibilityAxisCount(metric: BaseMetric): number {
  return RESPONSIBILITY_AXES.filter(([, spans]) => spans(metric)).length;
}

/**
 * Whether a module does too many things: it passes when its size or dependency/runtime surface
 * reaches a threshold and it also spans enough responsibility axes (for example 450 lines with 4
 * axes, or 100 lines with 6).
 */
function isMixedResponsibility(
  metric: Omit<
    ModuleQualityMetric,
    'responsibilityAxisCount' | 'mixedResponsibilities' | 'designSmellScore'
  >,
  axisCount: number
): boolean {
  const lineCount = metric.lineCount || 0;
  const dependencySurface = metric.fanIn + metric.fanOut;
  const runtimeSurface = metric.stackAwareDegree + metric.diRuntimeDegree + metric.contractDegree;

  const thresholds: Array<[number, number, number]> = [
    [lineCount, 450, 4],
    [lineCount, 320, 5],
    [lineCount, 140, 5],
    [lineCount, 100, 6],
    [dependencySurface, 18, 4],
    [runtimeSurface, 4, 4],
  ];
  return thresholds.some(([value, minValue, minAxes]) => value >= minValue && axisCount >= minAxes);
}

/**
 * Design smell score from 0 to 100, summing capped contributions of size, symbol count, coupling,
 * responsibility axes, god classes, long and complex methods and mixed responsibilities. Higher
 * means worse.
 */
function calculateDesignSmellScore(
  metric: Omit<
    ModuleQualityMetric,
    'responsibilityAxisCount' | 'mixedResponsibilities' | 'designSmellScore'
  >,
  responsibilityAxisCount: number,
  mixedResponsibilities: boolean
): number {
  return Math.min(
    100,
    ((metric.lineCount || 0) >= 600 ? 20 : Math.round((metric.lineCount || 0) / 40)) +
      Math.min(20, metric.symbolCount) +
      Math.min(15, metric.fanIn + metric.fanOut) +
      Math.min(15, responsibilityAxisCount * 3) +
      Math.min(15, metric.sourceMetrics.godClasses.length * 6) +
      Math.min(10, metric.sourceMetrics.longMethods.length * 3) +
      Math.min(10, metric.sourceMetrics.complexMethods.length * 3) +
      (mixedResponsibilities ? 10 : 0)
  );
}

const TOP_LIMIT = 10;
const MAX_FUNCTION_CLONES = 15;
const MIN_CLONE_FUNCTION_LINES = 8;

const labelOrder = (left: ModuleQualityMetric, right: ModuleQualityMetric) =>
  left.node.label.localeCompare(right.node.label);

/**
 * Measures one file node: reads its line count and source structure, takes coupling from the file
 * coupling table, counts framework, DI and contract links, and derives the responsibility and
 * smell values.
 */
const buildModuleMetric = (
  node: GraphNode,
  adjacency: ReturnType<typeof buildGraphAdjacency>,
  coupling: ReturnType<typeof computeFileCoupling>,
  limits: StructureLimits
): ModuleQualityMetric => {
  const links = [
    ...(adjacency.incomingByTarget.get(node.id) || []),
    ...(adjacency.outgoingBySource.get(node.id) || []),
  ];
  const baseMetric = {
    node,
    lineCount: getFileLineCount(node.id),
    symbolCount: getChildCodeSymbolCount(node.id, adjacency.childrenByParentId),
    fanIn: Math.round(coupling.get(node.id)?.fanIn ?? 0),
    fanOut: Math.round(coupling.get(node.id)?.fanOut ?? 0),
    stackAwareDegree: links.filter((link) => isStackAwareLink(link)).length,
    diRuntimeDegree: links.filter((link) => isDiRuntimeLink(link)).length,
    contractDegree: links.filter((link) => isContractSemanticLink(link)).length,
    sourceMetrics: analyzeSourceFileStructure(node.id, limits),
  };
  const responsibilityAxisCount = createResponsibilityAxisCount(baseMetric);
  const mixedResponsibilities = isMixedResponsibility(baseMetric, responsibilityAxisCount);

  return {
    ...baseMetric,
    responsibilityAxisCount,
    mixedResponsibilities,
    designSmellScore: calculateDesignSmellScore(
      baseMetric,
      responsibilityAxisCount,
      mixedResponsibilities
    ),
  };
};

/**
 * Whether a module is oversized: 600+ lines or 25+ symbols. Files that could not be read and have
 * no symbols do not qualify.
 */
export const isOversizedModule = (metric: ModuleQualityMetric): boolean =>
  ((metric.lineCount || 0) >= 600 || metric.symbolCount >= 25) &&
  (metric.lineCount !== null || metric.symbolCount > 0);

/**
 * Top modules by size: 600+ lines or 25+ symbols qualify, largest first. Files that could not be
 * read and have no symbols are skipped.
 */
const findOversizedModules = (metrics: ModuleQualityMetric[]) =>
  metrics
    .filter(isOversizedModule)
    .sort(
      (left, right) =>
        (right.lineCount || right.symbolCount * 20) - (left.lineCount || left.symbolCount * 20) ||
        right.symbolCount - left.symbolCount
    )
    .slice(0, TOP_LIMIT);

const isHugeModule = (metric: ModuleQualityMetric): boolean =>
  (metric.lineCount !== null && metric.lineCount >= 1500) || metric.symbolCount >= 45;

const isLargeModule = (metric: ModuleQualityMetric): boolean =>
  (metric.lineCount || 0) >= 900 || metric.symbolCount >= 30;

/**
 * Whether a large module also shows a second sign of being a god file: high coupling, many runtime
 * links, frequent changes, a god class or mixed responsibilities.
 */
const hasGodFileSignals = (metric: ModuleQualityMetric): boolean => {
  const stackDegree = metric.stackAwareDegree + metric.diRuntimeDegree + metric.contractDegree;
  return (
    metric.fanIn + metric.fanOut >= 12 ||
    stackDegree >= 6 ||
    metric.node.churn >= 10 ||
    metric.sourceMetrics.godClasses.length > 0 ||
    metric.mixedResponsibilities
  );
};

/** Whether a module is a god file: huge, or large with a second sign such as coupling or churn. */
export const isGodFile = (metric: ModuleQualityMetric): boolean =>
  isHugeModule(metric) || (isLargeModule(metric) && hasGodFileSignals(metric));

const godFileWeight = (metric: ModuleQualityMetric) =>
  (metric.lineCount || 0) +
  metric.symbolCount * 20 +
  (metric.fanIn + metric.fanOut) * 10 +
  metric.responsibilityAxisCount * 15;

const findGodFiles = (metrics: ModuleQualityMetric[]) =>
  metrics
    .filter(isGodFile)
    .sort((left, right) => godFileWeight(right) - godFileWeight(left) || labelOrder(left, right))
    .slice(0, TOP_LIMIT);

/** Modules that have at least one matching item, worst first by the best score among them. */
const rankByWorstMatch = <Item>(
  metrics: ModuleQualityMetric[],
  pick: (metric: ModuleQualityMetric) => Item[],
  score: (item: Item) => number
) => {
  const worst = (items: Item[]) => Math.max(...items.map(score));
  return metrics
    .filter((metric) => pick(metric).length > 0)
    .map((metric) => ({ metric, matched: pick(metric) }))
    .sort(
      (left, right) =>
        worst(right.matched) - worst(left.matched) || labelOrder(left.metric, right.metric)
    )
    .slice(0, TOP_LIMIT);
};

/**
 * Modules flagged as mixing responsibilities, with the most responsibility axes first, then the
 * longest.
 */
const findMixedResponsibilityModules = (metrics: ModuleQualityMetric[]) =>
  metrics
    .filter((metric) => metric.mixedResponsibilities)
    .sort(
      (left, right) =>
        right.responsibilityAxisCount - left.responsibilityAxisCount ||
        (right.lineCount || 0) - (left.lineCount || 0) ||
        labelOrder(left, right)
    )
    .slice(0, TOP_LIMIT);

type CloneGroups = ModuleQualitySummary['codeClones'];

/** Functions with an identical body: the fallback before the token-level detector has run. */
const findFunctionClones = (metrics: ModuleQualityMetric[]): CloneGroups => {
  const instancesByHash = new Map<
    string,
    Array<{ nodeId: string; methodName: string; lineCount: number }>
  >();
  for (const metric of metrics) {
    for (const func of metric.sourceMetrics.allFunctions) {
      if (func.lineCount < MIN_CLONE_FUNCTION_LINES || !func.bodyHash) continue;
      const bucket = instancesByHash.get(func.bodyHash) || [];
      bucket.push({ nodeId: metric.node.id, methodName: func.name, lineCount: func.lineCount });
      instancesByHash.set(func.bodyHash, bucket);
    }
  }
  return Array.from(instancesByHash.entries())
    .filter(([, instances]) => instances.length >= 2)
    .map(([bodyHash, instances]) => ({ bodyHash, instances }))
    .sort(
      (a, b) =>
        b.instances[0].lineCount * b.instances.length -
        a.instances[0].lineCount * a.instances.length
    )
    .slice(0, MAX_FUNCTION_CLONES);
};

/** Copy-paste across any language, found by the token-level detector once it has run. */
const findStructuralClones = (projectRoot: string | undefined): CloneGroups | null =>
  cloneIndex.peek(projectRoot)?.map((group) => ({
    bodyHash: `${group.tokenCount}:${group.instances[0].file}:${group.instances[0].startLine}`,
    instances: group.instances.map((instance) => ({
      nodeId: instance.file,
      methodName: `${instance.file.split('/').pop()}:${instance.startLine}-${instance.endLine}`,
      lineCount: group.lineCount,
    })),
  })) ?? null;

/**
 * Analyzes all files of the graph: builds the metrics, then ranks the worst files per smell,
 * ignoring test files and the files the project config excludes for the rankings. Reads files
 * from disk for line counts and structure.
 */
export function analyzeModuleQuality(graph: GraphData): ModuleQualitySummary {
  const adjacency = buildGraphAdjacency(graph);
  const coupling = computeFileCoupling(graph);
  const projectConfig = loadProjectConfig(graph.projectRoot);
  const limits = structureLimitsOf(projectConfig.config);
  const metrics = graph.nodes
    .filter((node) => node.type === 'file')
    .map((node) => buildModuleMetric(node, adjacency, coupling, limits));

  // A test file is long by nature (one describe per behaviour); size and complexity findings
  // are about code someone has to maintain in production, so tests stay in `metrics` only.
  const production = metrics.filter(
    (metric) => !isTestFile(metric.node.id) && !projectConfig.isExcluded(metric.node.id)
  );

  return {
    metrics,
    limits,
    oversizedModules: findOversizedModules(production),
    godFiles: findGodFiles(production),
    godClasses: rankByWorstMatch(
      production,
      (metric) => metric.sourceMetrics.godClasses,
      (item) => item.lineCount + item.methodCount * 15
    ).map(({ metric, matched }) => ({ ...metric, matchedClasses: matched })),
    longMethods: rankByWorstMatch(
      production,
      (metric) => metric.sourceMetrics.longMethods,
      (item) => item.lineCount
    ).map(({ metric, matched }) => ({ ...metric, matchedMethods: matched })),
    complexMethods: rankByWorstMatch(
      production,
      (metric) => metric.sourceMetrics.complexMethods,
      (item) => item.complexity * 10 + item.maxNesting * 5 + item.branchCount
    ).map(({ metric, matched }) => ({ ...metric, matchedMethods: matched })),
    mixedResponsibilityModules: findMixedResponsibilityModules(production),
    // The function-body comparison stays as the fallback (and for tiny projects).
    codeClones: findStructuralClones(graph.projectRoot) ?? findFunctionClones(metrics),
  };
}
