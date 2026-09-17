import { app } from 'electron';
import { GraphData, oracleStore } from '../store';
import { oracle } from '../oracle';
import * as path from 'path';

// Simple concurrency limit of 1 (Mutex) to replace p-limit and avoid ESM issues
let currentPromise: Promise<unknown> = Promise.resolve();
const analyzeLimit = async <T>(fn: () => Promise<T>): Promise<T> => {
  const result = currentPromise.then(() => fn());
  currentPromise = result.catch(() => {});
  return result;
};

export const normalizePath = (value?: string) => value?.replace(/\\/g, '/');

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

export const ensureGraphLoaded = async (projectPath?: string): Promise<GraphData> => {
  const state = oracleStore.getState();

  // Разрешаем любой абсолютный путь. Если путь относительный, резолвим от cwd.
  // Мы убираем жесткую привязку к SAFE_ROOT, так как CodeMaps должен иметь возможность
  // анализировать любые проекты на машине пользователя по запросу ИИ-агента или UI.
  let targetPath: string;
  if (projectPath) {
    targetPath = normalizePath(
      path.isAbsolute(projectPath) ? projectPath : path.resolve(process.cwd(), projectPath)
    )!;
  } else {
    targetPath = state.baseDir || normalizePath(process.env.CODEMAPS_ROOT || process.cwd())!;
  }

  // Prevent accidentally indexing the Electron installation directory if no project is opened
  if (!projectPath && !state.baseDir && !process.env.CODEMAPS_ROOT) {
    let isAppDir = false;
    try {
      const exeDir = normalizePath(path.dirname(app.getPath('exe')));
      const resourcesDir = normalizePath(process.resourcesPath);
      if (exeDir && targetPath.startsWith(exeDir)) isAppDir = true;
      if (resourcesDir && targetPath.startsWith(resourcesDir)) isAppDir = true;
    } catch {
      // Ignore if app is not available
    }

    if (isAppDir) {
      throw new Error(
        'No active project loaded in CodeMaps. Please use the analyze_project tool to specify an absolute projectPath first.'
      );
    }
  }

  if (!state.baseDir || (projectPath && normalizePath(state.baseDir) !== targetPath)) {
    return analyzeLimit(async () => {
      // Create a timeout promise
      const timeout = new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('oracle.analyzeProject timed out')), 60000)
      );
      // Race the analyzeProject call against the timeout
      return Promise.race([oracle.analyzeProject(targetPath), timeout]);
    });
  }

  return oracle.getGraph();
};

export const getNodeDependencies = (graph: GraphData, nodeId: string) => {
  const dependencies = graph.links.filter((link) => link.source === nodeId);
  const dependents = graph.links.filter((link) => link.target === nodeId);
  return { dependencies, dependents };
};

export const searchGraph = (graph: GraphData, query: string, type?: string, limit = 20) => {
  const normalizedQuery = query.trim().toLowerCase();
  return graph.nodes
    .filter((node) => {
      if (type && node.type !== type) return false;
      if (!normalizedQuery) return true;
      return (
        node.label.toLowerCase().includes(normalizedQuery) ||
        node.id.toLowerCase().includes(normalizedQuery)
      );
    })
    .slice(0, limit);
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
