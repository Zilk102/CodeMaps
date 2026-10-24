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

function isOrphanNode(
  node: GraphNode,
  layerByNodeId: Map<string, string>,
  adjacency: GraphAdjacency
): boolean {
  if (layerByNodeId.get(node.id) === 'configuration') {
    return false;
  }
  const { nodeById, incomingByTarget, outgoingBySource, childrenByParentId } = adjacency;
  const hasIncoming = (incomingByTarget.get(node.id) || []).length > 0;
  const hasOutgoing = (outgoingBySource.get(node.id) || []).length > 0;
  const hasKnownHierarchyParent = hasKnownParent(node, nodeById);
  const hasHierarchyChildren = (childrenByParentId.get(node.id) || []).length > 0;
  const structuralNode = node.type === 'directory' || node.type === 'project';
  return (
    !structuralNode &&
    !hasIncoming &&
    !hasOutgoing &&
    !hasKnownHierarchyParent &&
    !hasHierarchyChildren
  );
}

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

export class HealthScoreAnalyzer {
  constructor(private readonly architectureInsightService = new ArchitectureInsightService()) {}

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
