import { cloneIndex } from './clones/CloneIndex';
import { computeFileCoupling } from './couplingMetrics';
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

export interface ModuleQualitySummary {
  metrics: ModuleQualityMetric[];
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

function createResponsibilityAxisCount(
  metric: Omit<
    ModuleQualityMetric,
    'responsibilityAxisCount' | 'mixedResponsibilities' | 'designSmellScore'
  >
): number {
  const axes = new Set<string>();

  if (metric.fanIn >= 6) axes.add('fan_in');
  if (metric.fanOut >= 10) axes.add('fan_out');
  if (metric.symbolCount >= 20) axes.add('symbol_density');
  if ((metric.lineCount || 0) >= 500) axes.add('module_size');
  if (metric.sourceMetrics.classCount > 0) axes.add('oop_surface');
  if (metric.sourceMetrics.topLevelFunctionCount >= 8) axes.add('procedural_surface');
  if (metric.sourceMetrics.publicMethodCount >= 8) axes.add('public_api_surface');
  if (metric.stackAwareDegree > 0) axes.add('stack_orchestration');
  if (metric.diRuntimeDegree > 0) axes.add('runtime_di');
  if (metric.contractDegree > 0) axes.add('contract_binding');
  if (metric.node.churn >= 10) axes.add('high_churn');
  if (metric.sourceMetrics.longMethods.length > 0) axes.add('long_methods');
  if (metric.sourceMetrics.complexMethods.length > 0) axes.add('complex_methods');

  return axes.size;
}

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

  return (
    (lineCount >= 450 && axisCount >= 4) ||
    (lineCount >= 320 && axisCount >= 5) ||
    (lineCount >= 140 && axisCount >= 5) ||
    (lineCount >= 100 && axisCount >= 6) ||
    (dependencySurface >= 18 && axisCount >= 4) ||
    (runtimeSurface >= 4 && axisCount >= 4)
  );
}

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

const buildModuleMetric = (
  node: GraphNode,
  adjacency: ReturnType<typeof buildGraphAdjacency>,
  coupling: ReturnType<typeof computeFileCoupling>
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
    sourceMetrics: analyzeSourceFileStructure(node.id),
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

const findOversizedModules = (metrics: ModuleQualityMetric[]) =>
  metrics
    .filter(
      (metric) =>
        ((metric.lineCount || 0) >= 600 || metric.symbolCount >= 25) &&
        (metric.lineCount !== null || metric.symbolCount > 0)
    )
    .sort(
      (left, right) =>
        (right.lineCount || right.symbolCount * 20) - (left.lineCount || left.symbolCount * 20) ||
        right.symbolCount - left.symbolCount
    )
    .slice(0, TOP_LIMIT);

const isGodFile = (metric: ModuleQualityMetric): boolean => {
  if ((metric.lineCount !== null && metric.lineCount >= 1500) || metric.symbolCount >= 45) {
    return true;
  }
  const isLarge = (metric.lineCount || 0) >= 900 || metric.symbolCount >= 30;
  const stackDegree = metric.stackAwareDegree + metric.diRuntimeDegree + metric.contractDegree;
  return (
    isLarge &&
    (metric.fanIn + metric.fanOut >= 12 ||
      stackDegree >= 6 ||
      metric.node.churn >= 10 ||
      metric.sourceMetrics.godClasses.length > 0 ||
      metric.mixedResponsibilities)
  );
};

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

export function analyzeModuleQuality(graph: GraphData): ModuleQualitySummary {
  const adjacency = buildGraphAdjacency(graph);
  const coupling = computeFileCoupling(graph);
  const metrics = graph.nodes
    .filter((node) => node.type === 'file')
    .map((node) => buildModuleMetric(node, adjacency, coupling));

  return {
    metrics,
    oversizedModules: findOversizedModules(metrics),
    godFiles: findGodFiles(metrics),
    godClasses: rankByWorstMatch(
      metrics,
      (metric) => metric.sourceMetrics.godClasses,
      (item) => item.lineCount + item.methodCount * 15
    ).map(({ metric, matched }) => ({ ...metric, matchedClasses: matched })),
    longMethods: rankByWorstMatch(
      metrics,
      (metric) => metric.sourceMetrics.longMethods,
      (item) => item.lineCount
    ).map(({ metric, matched }) => ({ ...metric, matchedMethods: matched })),
    complexMethods: rankByWorstMatch(
      metrics,
      (metric) => metric.sourceMetrics.complexMethods,
      (item) => item.complexity * 10 + item.maxNesting * 5 + item.branchCount
    ).map(({ metric, matched }) => ({ ...metric, matchedMethods: matched })),
    mixedResponsibilityModules: findMixedResponsibilityModules(metrics),
    // The function-body comparison stays as the fallback (and for tiny projects).
    codeClones: findStructuralClones(graph.projectRoot) ?? findFunctionClones(metrics),
  };
}
