/**
 * Structural metrics of a project graph for the health score: orphan nodes, directory coverage,
 * link statistics and the incremental refresh pipeline telemetry.
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

type GraphAdjacency = ReturnType<typeof buildGraphAdjacency>;
type GraphNode = GraphData['nodes'][number];

/**
 * Whether a node has no links, no parent and no children at all. Configuration-layer nodes and
 * directory or project nodes are never orphans.
 */
export function isOrphanNode(
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
export function calculateDirectoryCoverageRatio(
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
export function buildRefreshMetrics(graph: GraphData) {
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
export function buildLinkMetrics(graph: GraphData, nodeById: GraphAdjacency['nodeById']) {
  return {
    unresolvedImportLinks: graph.links.filter(
      (link) => link.type === 'import' && !nodeById.has(link.target)
    ).length,
    stackAwareLinks: graph.links.filter((link) => isStackAwareLink(link)).length,
    diRuntimeLinks: graph.links.filter((link) => isDiRuntimeLink(link)).length,
    contractSemanticLinks: graph.links.filter((link) => isContractSemanticLink(link)).length,
  };
}
