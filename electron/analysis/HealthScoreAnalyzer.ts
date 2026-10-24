/**
 * Measures the structural health of a project graph (hierarchy, links, architecture, code quality,
 * refresh pipeline) and scores it.
 */

import { GraphData } from '../store/types';
import {
  buildGraphAdjacency,
  hasKnownParent,
  isContractSemanticLink,
  isDiRuntimeLink,
  isStackAwareLink,
  shouldHaveDirectoryParent,
} from './graphAnalysisUtils';
import { ArchitectureInsightService } from './ArchitectureInsightService';
import { analyzeModuleQuality } from './moduleQualityMetrics';
import {
  buildHealthScoreResult,
  calculateMaintainabilityScore,
  calculateSolidScore,
} from './healthScorePolicies';
import type { HealthScoreMetricSnapshot, HealthScoreResult } from './healthScoreTypes';
export type { HealthScoreIssue, HealthScoreResult, HealthScoreSummary } from './healthScoreTypes';

type Architecture = ReturnType<ArchitectureInsightService['analyze']>;
type ModuleQuality = ReturnType<typeof analyzeModuleQuality>;
type GraphAdjacency = ReturnType<typeof buildGraphAdjacency>;
type GraphNode = GraphData['nodes'][number];

interface QualityCounts {
  oversizedModules: number;
  godFiles: number;
  godClasses: number;
  longMethods: number;
  complexMethods: number;
  codeClones: number;
  mixedResponsibilityModules: number;
  avgDesignSmellScore: number;
}

function sumMatches<T>(items: T[], pick: (item: T) => unknown[]): number {
  return items.reduce((count, item) => count + pick(item).length, 0);
}

/**
 * Reduces module quality findings to counts, taking the number of matched classes or methods for
 * class and method findings, and the average design smell score over all modules.
 */
function summarizeQuality(quality: ModuleQuality): QualityCounts {
  return {
    oversizedModules: quality.oversizedModules.length,
    godFiles: quality.godFiles.length,
    godClasses: sumMatches(quality.godClasses, (metric) => metric.matchedClasses),
    longMethods: sumMatches(quality.longMethods, (metric) => metric.matchedMethods),
    complexMethods: sumMatches(quality.complexMethods, (metric) => metric.matchedMethods),
    codeClones: quality.codeClones ? quality.codeClones.length : 0,
    mixedResponsibilityModules: quality.mixedResponsibilityModules.length,
    avgDesignSmellScore:
      quality.metrics.length === 0
        ? 0
        : quality.metrics.reduce((sum, metric) => sum + metric.designSmellScore, 0) /
          quality.metrics.length,
  };
}

/**
 * Whether a node has no links, no parent and no children at all. Configuration-layer nodes and
 * directory or project nodes are never orphans.
 */
function isOrphanNode(
  node: GraphNode,
  layerByNodeId: Map<string, string>,
  adjacency: GraphAdjacency
): boolean {
  if (layerByNodeId.get(node.id) === 'configuration') {
    return false;
  }
  const { nodeById, incomingByTarget, outgoingBySource, childrenByParentId } = adjacency;
  const hasEntries = (map: Map<string, unknown[]>) => (map.get(node.id)?.length ?? 0) > 0;
  const isConnected =
    hasEntries(incomingByTarget) ||
    hasEntries(outgoingBySource) ||
    hasKnownParent(node, nodeById) ||
    hasEntries(childrenByParentId);
  const structuralNode = node.type === 'directory' || node.type === 'project';
  return !structuralNode && !isConnected;
}

/**
 * Share (0 to 1) of files and ADRs that should sit under a directory and actually have a directory
 * as parent. 1 when no node needs one.
 */
function calculateDirectoryCoverageRatio(
  graph: GraphData,
  nodeById: GraphAdjacency['nodeById']
): number {
  const directoryChildren = graph.nodes.filter((node) => {
    if (!shouldHaveDirectoryParent(node, graph.projectRoot)) {
      return false;
    }
    if (node.type !== 'file' && node.type !== 'adr') {
      return false;
    }
    if (!node.parentId) return false;
    const parent = nodeById.get(node.parentId);
    return parent?.type === 'directory';
  }).length;

  const nodesThatShouldHaveDirectoryParent = graph.nodes.filter((node) =>
    shouldHaveDirectoryParent(node, graph.projectRoot)
  ).length;

  return nodesThatShouldHaveDirectoryParent === 0
    ? 1
    : directoryChildren / nodesThatShouldHaveDirectoryParent;
}

type RefreshTelemetry = NonNullable<GraphData['refreshTelemetry']>;

const orZero = (value: number | undefined) => value || 0;

/**
 * Reads the incremental refresh telemetry (file watcher, enrichment and trends) into numeric
 * metrics, using 0 and a stable trend for anything that is missing.
 */
function buildRefreshMetrics(graph: GraphData) {
  const telemetry = graph.refreshTelemetry;
  const watcher: Partial<RefreshTelemetry['watcher']> = telemetry?.watcher ?? {};
  const enrichment: Partial<RefreshTelemetry['enrichment']> = telemetry?.enrichment ?? {};
  const trend: Partial<NonNullable<RefreshTelemetry['trends']>['enrichment']> =
    telemetry?.trends?.enrichment ?? {};
  const watcherMetrics = {
    watcherFlushes: orZero(watcher.flushCount),
    watcherBatchedEvents: orZero(watcher.batchedEventCount),
    watcherCoalescedFlushes: orZero(watcher.coalescedFlushes),
  };
  const enrichmentMetrics = {
    skippedRefreshes: orZero(enrichment.skippedRefreshes),
    runtimePriorityRebuilds: orZero(enrichment.runtimePriorityRebuilds),
    avgRefreshLatencyMs: orZero(enrichment.avgRefreshLatencyMs),
  };
  const trendMetrics = {
    refreshSkipRate: orZero(trend.skipRate),
    runtimePriorityRate: orZero(trend.runtimePriorityRate),
    refreshLatencyTrend: trend.latencyTrend || 'stable',
    refreshPipelineDegraded: trend.degraded || false,
  } as const;
  return { ...watcherMetrics, ...enrichmentMetrics, ...trendMetrics } as const;
}

/**
 * Counts unresolved import links (target missing from the graph), stack-aware links, DI runtime
 * links and API contract links.
 */
function buildLinkMetrics(graph: GraphData, nodeById: GraphAdjacency['nodeById']) {
  return {
    unresolvedImportLinks: graph.links.filter(
      (link) => link.type === 'import' && !nodeById.has(link.target)
    ).length,
    stackAwareLinks: graph.links.filter((link) => isStackAwareLink(link)).length,
    diRuntimeLinks: graph.links.filter((link) => isDiRuntimeLink(link)).length,
    contractSemanticLinks: graph.links.filter((link) => isContractSemanticLink(link)).length,
  };
}

/**
 * Combines violation and unknown layer counts from the architecture analysis with the
 * maintainability and SOLID scores computed from the quality counts.
 */
function buildArchitectureMetrics(
  architecture: Architecture,
  counts: QualityCounts,
  fileCount: number
) {
  const architectureViolations = architecture.summary.violationCount;
  return {
    architectureViolations,
    unknownLayerNodes: architecture.summary.unknownNodes,
    maintainabilityScore: calculateMaintainabilityScore({
      avgDesignSmellScore: counts.avgDesignSmellScore,
      longMethods: counts.longMethods,
      complexMethods: counts.complexMethods,
      oversizedModules: counts.oversizedModules,
      godFiles: counts.godFiles,
      fileNodes: fileCount,
      codeClones: counts.codeClones,
    }),
    solidScore: calculateSolidScore({
      godFiles: counts.godFiles,
      godClasses: counts.godClasses,
      mixedResponsibilityModules: counts.mixedResponsibilityModules,
      architectureViolations,
      avgDesignSmellScore: counts.avgDesignSmellScore,
    }),
  };
}

/** Computes the health score of a graph with the architecture and module quality analyzers. */
export class HealthScoreAnalyzer {
  constructor(private readonly architectureInsightService = new ArchitectureInsightService()) {}

  /**
   * Gathers all metrics of the graph and passes them to the scoring policy. The result has a 0-100
   * score, a grade, the metric summary and the issues found.
   */
  analyze(graph: GraphData): HealthScoreResult {
    const architecture = this.architectureInsightService.analyze(graph);
    const layerByNodeId = new Map<string, string>(
      architecture.classifications.map((record) => [record.nodeId, record.layer])
    );
    const adjacency = buildGraphAdjacency(graph);
    const counts = summarizeQuality(analyzeModuleQuality(graph));
    const fileCount = graph.nodes.filter((node) => node.type === 'file').length;
    const symbolCount = graph.nodes.filter((node) => node.id.includes('#')).length;
    const orphanCount = graph.nodes.filter((node) =>
      isOrphanNode(node, layerByNodeId, adjacency)
    ).length;

    const metrics: HealthScoreMetricSnapshot = {
      totalNodes: graph.nodes.length,
      totalLinks: graph.links.length,
      fileNodes: fileCount,
      symbolNodes: symbolCount,
      orphanNodes: orphanCount,
      ...buildLinkMetrics(graph, adjacency.nodeById),
      directoryCoverageRatio: calculateDirectoryCoverageRatio(graph, adjacency.nodeById),
      ...buildArchitectureMetrics(architecture, counts, fileCount),
      ...counts,
      ...buildRefreshMetrics(graph),
    };

    return buildHealthScoreResult(metrics);
  }
}
