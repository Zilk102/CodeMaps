import { cloneIndex } from '../analysis/clones/CloneIndex';
import { app } from 'electron';
import { GraphData, oracleStore } from '../store';
import { oracle } from '../oracle';
import * as fs from 'fs';
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

/** A mistyped path would otherwise index nothing and look like a successful, empty analysis. */
export const assertProjectDirectory = (resolvedPath: string, requestedPath: string) => {
  let isDirectory = false;
  try {
    isDirectory = fs.statSync(resolvedPath).isDirectory();
  } catch {
    isDirectory = false;
  }
  if (!isDirectory) {
    throw new Error(
      `Project path does not exist or is not a directory: ${requestedPath} (resolved to ${resolvedPath}). Pass an absolute path.`
    );
  }
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
    assertProjectDirectory(targetPath, projectPath);
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
    const analyzed = await analyzeLimit(async () => {
      // Create a timeout promise
      const timeout = new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('oracle.analyzeProject timed out')), 60000)
      );
      // Race the analyzeProject call against the timeout
      return Promise.race([oracle.analyzeProject(targetPath), timeout]);
    });
    return withCloneIndex(analyzed);
  }

  return withCloneIndex(oracle.getGraph());
};

/** Tools that report duplication read it from the clone index, so it must be current first. */
const withCloneIndex = async (graph: GraphData): Promise<GraphData> => {
  await cloneIndex.refreshFor(graph).catch(() => undefined);
  return graph;
};

export interface NeighbourFile {
  file: string;
  links: number;
}

const DEFAULT_DEPENDENCY_LIMIT = 25;

const relativeToRoot = (root: string | undefined, id: string) => {
  const normalizedRoot = (root ?? '').replace(/\\/g, '/').replace(/\/$/, '');
  const normalized = id.replace(/\\/g, '/');
  return normalizedRoot && normalized.toLowerCase().startsWith(`${normalizedRoot.toLowerCase()}/`)
    ? normalized.slice(normalizedRoot.length + 1)
    : normalized;
};

/**
 * Links around a node. A file node also covers its own symbols, because imports point at
 * `file#symbol`; without that a file would wrongly look unused. The per-file summaries list
 * every neighbouring file once with how many links tie it to the node.
 */
/**
 * Agents often pass `internal/app/main.go` instead of the absolute node id. A path relative to
 * the project root (optionally with `./` and a `#symbol`) is mapped to the id the graph uses;
 * anything else is returned unchanged so the caller reports it as not found.
 */
/** Drive-letter paths are absolute on every platform; graph ids use them on Windows. */
const isAbsoluteReference = (value: string) => path.isAbsolute(value) || /^[A-Za-z]:\//.test(value);

export const resolveNodeReference = (graph: GraphData, reference: string): string => {
  const normalized = reference.replace(/\\/g, '/');
  if (graph.nodes.some((node) => node.id === normalized)) return normalized;

  const root = (graph.projectRoot ?? '').replace(/\/$/, '');
  const relative = normalized.replace(/^\.\//, '');
  if (!root || isAbsoluteReference(relative)) return normalized;

  const candidate = `${root}/${relative}`;
  if (graph.nodes.some((node) => node.id === candidate)) return candidate;
  const lowered = candidate.toLowerCase();
  return graph.nodes.find((node) => node.id.toLowerCase() === lowered)?.id ?? normalized;
};

/** The same mapping for a file that may not be a graph node (for tools that read the file). */
export const resolveProjectFilePath = (graph: GraphData, filePath: string): string => {
  const normalized = filePath.replace(/\\/g, '/');
  if (isAbsoluteReference(normalized) || !graph.projectRoot) return normalized;
  return `${graph.projectRoot.replace(/\/$/, '')}/${normalized.replace(/^\.\//, '')}`;
};

export const getNodeDependencies = (
  graph: GraphData,
  nodeId: string,
  limit = DEFAULT_DEPENDENCY_LIMIT
) => {
  const node = graph.nodes.find((candidate) => candidate.id === nodeId);
  const memberPrefix = node?.type === 'file' ? `${nodeId}#` : null;
  const isOwn = (id: string) =>
    id === nodeId || (memberPrefix !== null && id.startsWith(memberPrefix));

  const allDependencies = graph.links.filter(
    (link) => isOwn(link.source) && (memberPrefix === null || !isOwn(link.target))
  );
  const allDependents = graph.links.filter(
    (link) => isOwn(link.target) && (memberPrefix === null || !isOwn(link.source))
  );

  const summarize = (
    links: typeof allDependencies,
    pick: (link: (typeof allDependencies)[number]) => string
  ) => {
    const counts = new Map<string, number>();
    for (const link of links) {
      if (link.type === 'structure') continue;
      const file = pick(link).split('#')[0];
      if (file === nodeId.split('#')[0]) continue;
      counts.set(file, (counts.get(file) ?? 0) + 1);
    }
    return Array.from(counts.entries())
      .map(([file, linkCount]): NeighbourFile => ({
        file: relativeToRoot(graph.projectRoot, file),
        links: linkCount,
      }))
      .sort((a, b) => b.links - a.links || a.file.localeCompare(b.file));
  };

  return {
    dependencyFiles: summarize(allDependencies, (link) => link.target),
    dependentFiles: summarize(allDependents, (link) => link.source),
    dependenciesTotal: allDependencies.length,
    dependentsTotal: allDependents.length,
    dependencies: allDependencies.slice(0, limit),
    dependents: allDependents.slice(0, limit),
  };
};

const matchRank = (node: GraphData['nodes'][number], query: string) => {
  const label = node.label.toLowerCase();
  if (label === query) return 0;
  if (label.startsWith(query)) return 1;
  if (label.includes(query)) return 2;
  // The path of a file matches every symbol inside it, which is noise; only files and
  // folders are worth finding by path.
  return node.id.includes('#') ? null : node.id.toLowerCase().includes(query) ? 3 : null;
};

/** Best matches first: exact name, then prefix, then substring, then path-only. */
export const searchGraph = (graph: GraphData, query: string, type?: string, limit = 20) => {
  const normalizedQuery = query.trim().toLowerCase();
  const candidates = graph.nodes.filter((node) => !type || node.type === type);

  if (!normalizedQuery) {
    return candidates.slice(0, limit);
  }

  return candidates
    .flatMap((node) => {
      const rank = matchRank(node, normalizedQuery);
      return rank === null ? [] : [{ node, rank }];
    })
    .sort(
      (a, b) =>
        a.rank - b.rank ||
        a.node.label.length - b.node.label.length ||
        a.node.id.localeCompare(b.node.id)
    )
    .slice(0, limit)
    .map((entry) => entry.node);
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
