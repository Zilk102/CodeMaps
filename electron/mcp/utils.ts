import { GraphData } from '../store';
import { oracle } from '../oracle';

export { assertProjectDirectory, ensureGraphLoaded, normalizePath } from './projectLoader';
export {
  getNodeDependencies,
  resolveNodeReference,
  resolveProjectFilePath,
  searchGraph,
} from './graphQueries';
export type { NeighbourFile } from './graphQueries';

export const getGraphSnapshot = (): GraphData => {
  return oracle.getGraph();
};

export const getGraphCountsByType = (graph: GraphData) => {
  return graph.nodes.reduce<Record<string, number>>((acc, node) => {
    acc[node.type] = (acc[node.type] || 0) + 1;
    return acc;
  }, {});
};

export const createGraphSummary = (graph: GraphData) => {
  const nodesCount = graph.nodes.length;
  const linksCount = graph.links.length;
  const nodeTypes = getGraphCountsByType(graph);
  const refreshTelemetry = graph.refreshTelemetry
    ? {
        watcher: {
          flushCount: graph.refreshTelemetry.watcher.flushCount,
          batchedEventCount: graph.refreshTelemetry.watcher.batchedEventCount,
          coalescedFlushes: graph.refreshTelemetry.watcher.coalescedFlushes,
          maxBatchSize: graph.refreshTelemetry.watcher.maxBatchSize,
          lastBatchSize: graph.refreshTelemetry.watcher.lastBatchSize,
          lastEvent: graph.refreshTelemetry.watcher.lastEvent,
          recentBatchSizes: graph.refreshTelemetry.watcher.recentBatchSizes,
        },
        enrichment: {
          skippedRefreshes: graph.refreshTelemetry.enrichment.skippedRefreshes,
          rebuiltRefreshes: graph.refreshTelemetry.enrichment.rebuiltRefreshes,
          runtimePriorityRebuilds: graph.refreshTelemetry.enrichment.runtimePriorityRebuilds,
          directoryTriggeredRebuilds: graph.refreshTelemetry.enrichment.directoryTriggeredRebuilds,
          avgRefreshLatencyMs: graph.refreshTelemetry.enrichment.avgRefreshLatencyMs,
          lastRefreshMode: graph.refreshTelemetry.enrichment.lastRefreshMode,
          lastRefreshReason: graph.refreshTelemetry.enrichment.lastRefreshReason,
          recentLatencyMs: graph.refreshTelemetry.enrichment.recentLatencyMs,
          recentModes: graph.refreshTelemetry.enrichment.recentModes,
        },
        trends: graph.refreshTelemetry.trends,
      }
    : undefined;

  return {
    projectRoot: graph.projectRoot,
    nodesCount,
    linksCount,
    nodeTypes,
    refreshTelemetry,
  };
};

export const createTextContent = (payload: unknown) => {
  if (typeof payload === 'string') return payload;
  return JSON.stringify(payload, null, 2);
};

export const createAgentPlaybook = () => ({
  version: 4,
  goal: 'A regular user connects CodeMaps to the agent, and the agent chooses the right tools automatically without needing MCP command knowledge.',
  preferredDefaultFlow: {
    openProject: 'analyze_project',
    naturalLanguageRequest: 'prepare_task_context',
    understandProject: 'prepare_project_context',
    largeScaleChange: 'prepare_change_campaign',
    codeChange: 'prepare_change_context',
    review: 'prepare_review_context',
  },
  rules: [
    'If the project is not open yet, call analyze_project first.',
    'If the user describes a problem, feature, degradation, or review in natural language, the agent should call prepare_task_context first.',
    'Immediately after opening a project, the agent should call prepare_project_context to build a mental model of entry points, orchestrators, and architectural boundaries.',
    'If the request mentions watcher behavior, refresh latency, batching, stale graph updates, or incremental indexing degradation, prefer prepare_task_context so CodeMaps can route into a telemetry-aware review workflow.',
    'For mass migrations, library switches, and broad refactoring campaigns, use prepare_change_campaign instead of single-target prepare_change_context.',
    'For bugfix/feature/refactor, call prepare_change_context first.',
    'For review, architectural assessment, and post-change validation, call prepare_review_context first.',
    'Use low-level tools only as a fallback when the composite context is insufficient.',
  ],
  fallbackTools: [
    'search_graph',
    'get_node_dependencies',
    'get_blast_radius',
    'get_architecture_overview',
    'get_health_score',
    'detect_patterns',
    'run_security_scan',
    'search_signatures',
  ],
});
