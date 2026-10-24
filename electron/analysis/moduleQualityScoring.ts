/**
 * Measures one file for the module quality analysis: coupling and link counts, the responsibility
 * axes it spans, whether it mixes responsibilities and its design smell score.
 */

import { computeFileCoupling } from './couplingMetrics';
import type { StructureLimits } from './projectConfig/structureLimits';
import type { GraphNode } from '../store/types';
import {
  buildGraphAdjacency,
  getChildCodeSymbolCount,
  getFileLineCount,
  isContractSemanticLink,
  isDiRuntimeLink,
  isStackAwareLink,
} from './graphAnalysisUtils';
import { analyzeSourceFileStructure } from './sourceFileStructure';
import type { ModuleQualityMetric } from './moduleQualityTypes';

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

/**
 * Measures one file node: reads its line count and source structure, takes coupling from the file
 * coupling table, counts framework, DI and contract links, and derives the responsibility and
 * smell values.
 */
export const buildModuleMetric = (
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
