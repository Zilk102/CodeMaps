/**
 * Measures every file of the graph for size, coupling and responsibility mix, and finds the worst
 * offenders (oversized modules, god files and classes, long or complex methods, mixed
 * responsibilities, clones).
 */

import { computeFileCoupling } from './couplingMetrics';
import { loadProjectConfig } from './projectConfig/configLoader';
import { structureLimitsOf } from './projectConfig/structureLimits';
import { isTestFile } from './testFiles';
import { GraphData } from '../store/types';
import { buildGraphAdjacency } from './graphAnalysisUtils';
import { buildModuleMetric } from './moduleQualityScoring';
import {
  findGodFiles,
  findMixedResponsibilityModules,
  findOversizedModules,
  rankByWorstMatch,
} from './moduleQualityRankings';
import { findFunctionClones, findStructuralClones } from './moduleQualityClones';
import type { ModuleQualitySummary } from './moduleQualityTypes';

export { analyzeSourceFileStructure } from './sourceFileStructure';
export { isGodFile, isOversizedModule } from './moduleQualityRankings';
export type { ModuleQualityMetric, ModuleQualitySummary } from './moduleQualityTypes';
export type {
  SourceClassMetric,
  SourceFileMetrics,
  SourceFunctionMetric,
} from './sourceFileStructure';

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
