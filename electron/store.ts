import log from 'electron-log/main';
import { createStore } from 'zustand/vanilla';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { app } from 'electron';

function getUserDataDir(): string {
  try {
    if (typeof app?.getPath === 'function') {
      return app.getPath('userData');
    }
  } catch {
    // Fallback when Electron app context is unavailable.
  }
  return process.env.LOCALAPPDATA || process.env.APPDATA || path.join(os.homedir(), '.codemaps');
}

function getRecentProjectsFile(): string {
  return path.join(getUserDataDir(), 'codemaps-recent-projects.json');
}

type TrendState = 'stable' | 'improving' | 'degrading';
type RefreshEvent = 'add' | 'change' | 'unlink' | 'addDir' | 'unlinkDir';
type RefreshMode = 'skipped' | 'rebuilt';
type RefreshReason =
  | 'no_stack_impact'
  | 'directory_structure_changed'
  | 'stack_runtime_path_changed';

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null;

const asFiniteNumber = (value: unknown, fallback = 0) =>
  typeof value === 'number' && Number.isFinite(value) ? value : fallback;

const asBoolean = (value: unknown, fallback = false) =>
  typeof value === 'boolean' ? value : fallback;

const asString = (value: unknown, fallback = '') => (typeof value === 'string' ? value : fallback);

const asTrendState = (value: unknown): TrendState =>
  value === 'improving' || value === 'degrading' ? value : 'stable';

const asRefreshMode = (value: unknown): RefreshMode | null =>
  value === 'skipped' || value === 'rebuilt' ? value : null;

const asRefreshReason = (value: unknown): RefreshReason | null =>
  value === 'no_stack_impact' ||
  value === 'directory_structure_changed' ||
  value === 'stack_runtime_path_changed'
    ? value
    : null;

const normalizeProjectPath = (projectPath: string) => projectPath.replace(/\\/g, '/');

function loadRecentProjects(): RecentProject[] {
  try {
    const data = fs.readFileSync(getRecentProjectsFile(), 'utf-8');
    const parsed = JSON.parse(data) as unknown;
    if (Array.isArray(parsed)) {
      return parsed
        .map((project) => normalizeRecentProject(project))
        .filter((project): project is RecentProject => project !== null)
        .slice(0, 10);
    }
  } catch {
    // File doesn't exist or is corrupt.
  }
  return [];
}

function saveRecentProjects(projects: RecentProject[]) {
  try {
    const file = getRecentProjectsFile();
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, JSON.stringify(projects, null, 2));
  } catch (err) {
    log.error('[RecentProjects] Failed to save:', err);
  }
}

export interface GraphNode {
  id: string;
  label: string;
  group: number;
  type: string;
  churn: number;
  adr?: string;
  parentId?: string; // Указатель на родительский элемент (Слой Иерархии)
  exports?: Array<{
    exportedName: string;
    localName?: string;
    isDefault?: boolean;
  }>;
}

export interface GraphLink {
  source: string;
  target: string;
  value: number;
  type?: string;
  reason?: string;
}

export interface GraphData {
  nodes: GraphNode[];
  links: GraphLink[];
  projectRoot: string;
  refreshTelemetry?: RefreshTelemetry;
}

export interface RefreshTelemetry {
  watcher: {
    flushCount: number;
    batchedEventCount: number;
    coalescedFlushes: number;
    maxBatchSize: number;
    lastBatchSize: number;
    lastEvent: 'add' | 'change' | 'unlink' | 'addDir' | 'unlinkDir' | null;
    recentBatchSizes: number[];
  };
  enrichment: {
    skippedRefreshes: number;
    rebuiltRefreshes: number;
    runtimePriorityRebuilds: number;
    directoryTriggeredRebuilds: number;
    avgRefreshLatencyMs: number;
    lastRefreshMode: 'skipped' | 'rebuilt' | null;
    lastRefreshReason:
      | 'no_stack_impact'
      | 'directory_structure_changed'
      | 'stack_runtime_path_changed'
      | null;
    recentLatencyMs: number[];
    recentModes: Array<'skipped' | 'rebuilt'>;
  };
  trends: {
    watcher: {
      coalescingRatio: number;
      batchSizeTrend: 'stable' | 'improving' | 'degrading';
    };
    enrichment: {
      skipRate: number;
      runtimePriorityRate: number;
      latencyTrend: 'stable' | 'improving' | 'degrading';
      degraded: boolean;
    };
  };
}

export interface RecentProject {
  path: string;
  name: string;
  lastOpened: string;
  telemetry?: RecentProjectTelemetrySnapshot;
}

export interface RecentProjectTelemetrySnapshot {
  updatedAt: string;
  degraded: boolean;
  avgRefreshLatencyMs: number;
  skipRate: number;
  coalescingRatio: number;
  runtimePriorityRate: number;
  latencyTrend: TrendState;
  batchSizeTrend: TrendState;
  maxBatchSize: number;
  lastBatchSize: number;
  lastRefreshMode: RefreshMode | null;
  lastRefreshReason: RefreshReason | null;
}

export interface GraphDiff {
  nodesAdded: GraphNode[];
  nodesRemoved: string[];
  linksAdded: GraphLink[];
  linksRemoved: GraphLink[]; // Для упрощения на фронте можно просто передавать измененные линки
}

export interface OracleState {
  baseDir: string;
  nodes: Map<string, GraphNode>;
  links: GraphLink[];
  churnMap: Map<string, number>;
  nodeRevision: number;
  linkRevision: number;
  telemetryRevision: number;
  recentProjects: RecentProject[];
  refreshTelemetry: RefreshTelemetry;

  // Actions
  setBaseDir: (dir: string) => void;
  setChurnMap: (map: Map<string, number>) => void;
  resetRefreshTelemetry: () => void;
  recordWatcherFlush: (batchSize: number, event: RefreshEvent) => void;
  recordEnrichmentRefresh: (entry: {
    mode: RefreshMode;
    reason: RefreshReason;
    durationMs: number;
  }) => void;

  // Atomic updates to avoid race conditions during parallel parsing
  upsertNode: (node: GraphNode) => void;
  removeNode: (id: string) => void;
  removeNodesPrefix: (prefix: string) => void;

  addLink: (link: GraphLink) => void;
  removeLinksBySource: (source: string) => void;
  removeLinksBySourceOrTarget: (id: string) => void;
  removeLinksByTypes: (types: string[]) => void;

  // Batch updates for restoring from cache
  restoreCache: (nodes: GraphNode[], links: GraphLink[]) => void;

  clear: () => void;
  getValidGraph: () => GraphData;

  // Diff tracking
  pendingDiff: GraphDiff;
  resetDiff: () => void;
  getAndResetDiff: () => GraphDiff;

  // Recent projects
  addRecentProject: (
    projectPath: string,
    projectName: string,
    refreshTelemetry?: RefreshTelemetry
  ) => void;
  updateRecentProjectTelemetry: (projectPath: string, refreshTelemetry: RefreshTelemetry) => void;
  clearRecentProjects: () => void;
}

const TELEMETRY_HISTORY_LIMIT = 12;

const pushLimited = <T>(items: T[], value: T) => [...items, value].slice(-TELEMETRY_HISTORY_LIMIT);

const average = (values: number[]) =>
  values.length === 0 ? 0 : values.reduce((sum, value) => sum + value, 0) / values.length;

const computeBatchSizeTrend = (recentBatchSizes: number[]): 'stable' | 'improving' | 'degrading' => {
  if (recentBatchSizes.length < 4) {
    return 'stable';
  }
  const midpoint = Math.floor(recentBatchSizes.length / 2);
  const firstHalf = average(recentBatchSizes.slice(0, midpoint));
  const secondHalf = average(recentBatchSizes.slice(midpoint));

  if (secondHalf >= firstHalf + 0.75) {
    return 'improving';
  }
  if (secondHalf <= firstHalf - 0.75) {
    return 'degrading';
  }
  return 'stable';
};

const computeLatencyTrend = (recentLatencyMs: number[]): 'stable' | 'improving' | 'degrading' => {
  if (recentLatencyMs.length < 4) {
    return 'stable';
  }
  const midpoint = Math.floor(recentLatencyMs.length / 2);
  const firstHalf = average(recentLatencyMs.slice(0, midpoint));
  const secondHalf = average(recentLatencyMs.slice(midpoint));

  if (secondHalf >= firstHalf + 8) {
    return 'degrading';
  }
  if (secondHalf <= Math.max(0, firstHalf - 8)) {
    return 'improving';
  }
  return 'stable';
};

const buildRefreshTrends = (telemetry: Omit<RefreshTelemetry, 'trends'>): RefreshTelemetry['trends'] => {
  const totalWatcherFlushes = telemetry.watcher.flushCount || 1;
  const totalEnrichmentRefreshes =
    telemetry.enrichment.skippedRefreshes + telemetry.enrichment.rebuiltRefreshes || 1;
  const coalescingRatio = telemetry.watcher.coalescedFlushes / totalWatcherFlushes;
  const skipRate = telemetry.enrichment.skippedRefreshes / totalEnrichmentRefreshes;
  const runtimePriorityRate =
    telemetry.enrichment.runtimePriorityRebuilds / totalEnrichmentRefreshes;
  const latencyTrend = computeLatencyTrend(telemetry.enrichment.recentLatencyMs);

  return {
    watcher: {
      coalescingRatio,
      batchSizeTrend: computeBatchSizeTrend(telemetry.watcher.recentBatchSizes),
    },
    enrichment: {
      skipRate,
      runtimePriorityRate,
      latencyTrend,
      degraded:
        latencyTrend === 'degrading' ||
        telemetry.enrichment.avgRefreshLatencyMs >= 50 ||
        skipRate >= 0.35,
    },
  };
};

const buildRecentProjectTelemetrySnapshot = (
  refreshTelemetry: RefreshTelemetry
): RecentProjectTelemetrySnapshot => ({
  updatedAt: new Date().toISOString(),
  degraded: refreshTelemetry.trends.enrichment.degraded,
  avgRefreshLatencyMs: refreshTelemetry.enrichment.avgRefreshLatencyMs,
  skipRate: refreshTelemetry.trends.enrichment.skipRate,
  coalescingRatio: refreshTelemetry.trends.watcher.coalescingRatio,
  runtimePriorityRate: refreshTelemetry.trends.enrichment.runtimePriorityRate,
  latencyTrend: refreshTelemetry.trends.enrichment.latencyTrend,
  batchSizeTrend: refreshTelemetry.trends.watcher.batchSizeTrend,
  maxBatchSize: refreshTelemetry.watcher.maxBatchSize,
  lastBatchSize: refreshTelemetry.watcher.lastBatchSize,
  lastRefreshMode: refreshTelemetry.enrichment.lastRefreshMode,
  lastRefreshReason: refreshTelemetry.enrichment.lastRefreshReason,
});

const normalizeRecentProjectTelemetry = (value: unknown): RecentProjectTelemetrySnapshot | undefined => {
  if (!isRecord(value)) {
    return undefined;
  }

  return {
    updatedAt: asString(value.updatedAt, new Date(0).toISOString()),
    degraded: asBoolean(value.degraded),
    avgRefreshLatencyMs: asFiniteNumber(value.avgRefreshLatencyMs),
    skipRate: asFiniteNumber(value.skipRate),
    coalescingRatio: asFiniteNumber(value.coalescingRatio),
    runtimePriorityRate: asFiniteNumber(value.runtimePriorityRate),
    latencyTrend: asTrendState(value.latencyTrend),
    batchSizeTrend: asTrendState(value.batchSizeTrend),
    maxBatchSize: asFiniteNumber(value.maxBatchSize),
    lastBatchSize: asFiniteNumber(value.lastBatchSize),
    lastRefreshMode: asRefreshMode(value.lastRefreshMode),
    lastRefreshReason: asRefreshReason(value.lastRefreshReason),
  };
};

const normalizeRecentProject = (value: unknown): RecentProject | null => {
  if (!isRecord(value)) {
    return null;
  }

  const projectPath = asString(value.path);
  const projectName = asString(value.name);
  const lastOpened = asString(value.lastOpened);

  if (!projectPath || !projectName || !lastOpened) {
    return null;
  }

  return {
    path: normalizeProjectPath(projectPath),
    name: projectName,
    lastOpened,
    telemetry: normalizeRecentProjectTelemetry(value.telemetry),
  };
};

const initialRefreshTelemetry: RefreshTelemetry = {
  watcher: {
    flushCount: 0,
    batchedEventCount: 0,
    coalescedFlushes: 0,
    maxBatchSize: 0,
    lastBatchSize: 0,
    lastEvent: null,
    recentBatchSizes: [],
  },
  enrichment: {
    skippedRefreshes: 0,
    rebuiltRefreshes: 0,
    runtimePriorityRebuilds: 0,
    directoryTriggeredRebuilds: 0,
    avgRefreshLatencyMs: 0,
    lastRefreshMode: null,
    lastRefreshReason: null,
    recentLatencyMs: [],
    recentModes: [],
  },
  trends: {
    watcher: {
      coalescingRatio: 0,
      batchSizeTrend: 'stable',
    },
    enrichment: {
      skipRate: 0,
      runtimePriorityRate: 0,
      latencyTrend: 'stable',
      degraded: false,
    },
  },
};

export const oracleStore = createStore<OracleState>()((set, get) => ({
  baseDir: '',
  nodes: new Map(),
  links: [],
  churnMap: new Map(),
  nodeRevision: 0,
  linkRevision: 0,
  telemetryRevision: 0,
  pendingDiff: { nodesAdded: [], nodesRemoved: [], linksAdded: [], linksRemoved: [] },
  recentProjects: loadRecentProjects(),
  refreshTelemetry: initialRefreshTelemetry,
  setBaseDir: (dir) => set({ baseDir: dir }),

  setChurnMap: (map) => set({ churnMap: map }),
  resetRefreshTelemetry: () =>
    set((state) => ({
      refreshTelemetry: initialRefreshTelemetry,
      telemetryRevision: state.telemetryRevision + 1,
    })),
  recordWatcherFlush: (batchSize, event) =>
    set((state) => {
      const watcher = {
        watcher: {
          flushCount: state.refreshTelemetry.watcher.flushCount + 1,
          batchedEventCount: state.refreshTelemetry.watcher.batchedEventCount + batchSize,
          coalescedFlushes:
            state.refreshTelemetry.watcher.coalescedFlushes + (batchSize > 1 ? 1 : 0),
          maxBatchSize: Math.max(state.refreshTelemetry.watcher.maxBatchSize, batchSize),
          lastBatchSize: batchSize,
          lastEvent: event,
          recentBatchSizes: pushLimited(state.refreshTelemetry.watcher.recentBatchSizes, batchSize),
        },
        enrichment: state.refreshTelemetry.enrichment,
      };

      return {
        refreshTelemetry: {
          ...watcher,
          trends: buildRefreshTrends(watcher),
        },
        telemetryRevision: state.telemetryRevision + 1,
      };
    }),
  recordEnrichmentRefresh: ({ mode, reason, durationMs }) =>
    set((state) => {
      const previousCount =
        state.refreshTelemetry.enrichment.skippedRefreshes +
        state.refreshTelemetry.enrichment.rebuiltRefreshes;
      const nextCount = previousCount + 1;
      const nextAvgLatency =
        previousCount === 0
          ? durationMs
          : (state.refreshTelemetry.enrichment.avgRefreshLatencyMs * previousCount + durationMs) /
            nextCount;

      const telemetry = {
        watcher: state.refreshTelemetry.watcher,
        enrichment: {
          skippedRefreshes:
            state.refreshTelemetry.enrichment.skippedRefreshes + (mode === 'skipped' ? 1 : 0),
          rebuiltRefreshes:
            state.refreshTelemetry.enrichment.rebuiltRefreshes + (mode === 'rebuilt' ? 1 : 0),
          runtimePriorityRebuilds:
            state.refreshTelemetry.enrichment.runtimePriorityRebuilds +
            (reason === 'stack_runtime_path_changed' ? 1 : 0),
          directoryTriggeredRebuilds:
            state.refreshTelemetry.enrichment.directoryTriggeredRebuilds +
            (reason === 'directory_structure_changed' ? 1 : 0),
          avgRefreshLatencyMs: nextAvgLatency,
          lastRefreshMode: mode,
          lastRefreshReason: reason,
          recentLatencyMs: pushLimited(state.refreshTelemetry.enrichment.recentLatencyMs, durationMs),
          recentModes: pushLimited(state.refreshTelemetry.enrichment.recentModes, mode),
        },
      };

      return {
        refreshTelemetry: {
          ...telemetry,
          trends: buildRefreshTrends(telemetry),
        },
        telemetryRevision: state.telemetryRevision + 1,
      };
    }),

  upsertNode: (node) =>
    set((state) => {
      const newNodes = new Map(state.nodes);
      newNodes.set(node.id, node);
      return {
        nodes: newNodes,
        nodeRevision: state.nodeRevision + 1,
        pendingDiff: {
          ...state.pendingDiff,
          nodesAdded: [...state.pendingDiff.nodesAdded, node],
        },
      };
    }),

  removeNode: (id) =>
    set((state) => {
      const newNodes = new Map(state.nodes);
      newNodes.delete(id);
      return {
        nodes: newNodes,
        nodeRevision: state.nodeRevision + 1,
        pendingDiff: {
          ...state.pendingDiff,
          nodesRemoved: [...state.pendingDiff.nodesRemoved, id],
        },
      };
    }),

  removeNodesPrefix: (prefix) =>
    set((state) => {
      const newNodes = new Map(state.nodes);
      const removed: string[] = [];
      for (const [id] of newNodes) {
        if (id.startsWith(prefix)) {
          newNodes.delete(id);
          removed.push(id);
        }
      }
      return {
        nodes: newNodes,
        nodeRevision: state.nodeRevision + 1,
        pendingDiff: {
          ...state.pendingDiff,
          nodesRemoved: [...state.pendingDiff.nodesRemoved, ...removed],
        },
      };
    }),

  addLink: (link) =>
    set((state) => ({
      links: [...state.links, link],
      linkRevision: state.linkRevision + 1,
      pendingDiff: {
        ...state.pendingDiff,
        linksAdded: [...state.pendingDiff.linksAdded, link],
      },
    })),

  removeLinksBySource: (source) =>
    set((state) => {
      const toRemove = state.links.filter((l) => l.source === source);
      return {
        links: state.links.filter((l) => l.source !== source),
        linkRevision: state.linkRevision + 1,
        pendingDiff: {
          ...state.pendingDiff,
          linksRemoved: [...state.pendingDiff.linksRemoved, ...toRemove],
        },
      };
    }),

  removeLinksBySourceOrTarget: (id) =>
    set((state) => {
      const toRemove = state.links.filter((l) => l.source === id || l.target === id);
      return {
        links: state.links.filter((l) => l.source !== id && l.target !== id),
        linkRevision: state.linkRevision + 1,
        pendingDiff: {
          ...state.pendingDiff,
          linksRemoved: [...state.pendingDiff.linksRemoved, ...toRemove],
        },
      };
    }),

  removeLinksByTypes: (types) =>
    set((state) => {
      const typeSet = new Set(types);
      const toRemove = state.links.filter((l) => l.type && typeSet.has(l.type));
      return {
        links: state.links.filter((l) => !l.type || !typeSet.has(l.type)),
        linkRevision: state.linkRevision + 1,
        pendingDiff: {
          ...state.pendingDiff,
          linksRemoved: [...state.pendingDiff.linksRemoved, ...toRemove],
        },
      };
    }),

  restoreCache: (nodes, links) =>
    set((state) => {
      const baseDir = state.baseDir.replace(/\\/g, '/');
      const normalizedNodes = nodes.map((node) => {
        const normalizedId = node.id.replace(/\\/g, '/');
        const normalizedParentId = node.parentId?.replace(/\\/g, '/');

        if (node.type === 'directory') {
          if (normalizedParentId) {
            return { ...node, id: normalizedId, parentId: normalizedParentId };
          }

          const parentDir = normalizedId.substring(0, normalizedId.lastIndexOf('/'));
          const hasParent = parentDir.startsWith(baseDir) && parentDir !== baseDir;
          return {
            ...node,
            id: normalizedId,
            parentId: hasParent ? parentDir : undefined,
          };
        }

        if (node.type === 'file' || node.type === 'adr') {
          const parentDir = normalizedId.substring(0, normalizedId.lastIndexOf('/'));
          const hasParent = parentDir.startsWith(baseDir) && parentDir !== baseDir;
          return {
            ...node,
            id: normalizedId,
            parentId: hasParent ? parentDir : undefined,
          };
        }

        if (normalizedId.includes('#')) {
          const fileId = normalizedId.split('#')[0];
          return {
            ...node,
            id: normalizedId,
            parentId: fileId,
          };
        }

        return {
          ...node,
          id: normalizedId,
          parentId: normalizedParentId,
        };
      });

      const newNodes = new Map();
      normalizedNodes.forEach((n) => newNodes.set(n.id, n));
      return {
        nodes: newNodes,
        links,
        nodeRevision: state.nodeRevision + 1,
        linkRevision: state.linkRevision + 1,
      };
    }),

  clear: () =>
    set({
      baseDir: '',
      nodes: new Map(),
      links: [],
      churnMap: new Map(),
      nodeRevision: 0,
      linkRevision: 0,
      telemetryRevision: 0,
      refreshTelemetry: initialRefreshTelemetry,
    }),

  getValidGraph: () => {
    const state = get();
    const possibleExts = [
      '.ts',
      '.tsx',
      '.js',
      '.jsx',
      '.mts',
      '.cts',
      '.mjs',
      '.cjs',
      '/index.ts',
      '/index.tsx',
      '/index.js',
      '/index.jsx',
      '/index.mts',
      '/index.cts',
      '/index.mjs',
      '/index.cjs',
    ];

    const validLinks: GraphLink[] = [];
    const resolveSymbolTarget = (filePath: string, symbolName: string) => {
      const fileNode = state.nodes.get(filePath);

      if (state.nodes.has(`${filePath}#${symbolName}`)) {
        return `${filePath}#${symbolName}`;
      }

      if (!fileNode?.exports?.length) {
        return undefined;
      }

      const directExport = fileNode.exports.find(
        (record) =>
          record.exportedName === symbolName || (symbolName === 'default' && record.isDefault)
      );

      if (directExport?.localName && state.nodes.has(`${filePath}#${directExport.localName}`)) {
        return `${filePath}#${directExport.localName}`;
      }

      if (directExport && state.nodes.has(`${filePath}#${directExport.exportedName}`)) {
        return `${filePath}#${directExport.exportedName}`;
      }

      return undefined;
    };

    state.links.forEach((l) => {
      let resolvedTarget = l.target;
      let isValid = false;

      if (resolvedTarget.includes('#')) {
        if (state.nodes.has(resolvedTarget)) {
          isValid = true;
        } else {
          const [filePath, entityName] = resolvedTarget.split('#');
          const directResolvedSymbol = resolveSymbolTarget(filePath, entityName);
          if (directResolvedSymbol) {
            resolvedTarget = directResolvedSymbol;
            isValid = true;
          }

          if (isValid) {
            validLinks.push({ ...l, target: resolvedTarget });
            return;
          }

          for (const ext of possibleExts) {
            const resolvedSymbol = resolveSymbolTarget(`${filePath}${ext}`, entityName);
            if (resolvedSymbol) {
              resolvedTarget = resolvedSymbol;
              isValid = true;
              break;
            }
          }

          if (!isValid) {
            if (state.nodes.has(filePath)) {
              resolvedTarget = filePath;
              isValid = true;
            } else {
              for (const ext of possibleExts) {
                const fullFile = `${filePath}${ext}`;
                if (state.nodes.has(fullFile)) {
                  resolvedTarget = fullFile;
                  isValid = true;
                  break;
                }
              }
            }
          }
        }
      } else {
        if (state.nodes.has(resolvedTarget)) {
          isValid = true;
        } else {
          const targetNode = state.nodes.get(resolvedTarget);
          if (targetNode && targetNode.type === 'directory') {
            isValid = true;
          } else {
            for (const ext of possibleExts) {
              const p = resolvedTarget + ext;
              if (state.nodes.has(p)) {
                resolvedTarget = p;
                isValid = true;
                break;
              }
            }
          }
        }
      }

      if (isValid) {
        validLinks.push({ ...l, target: resolvedTarget });
      }
    });

    return {
      projectRoot: state.baseDir,
      nodes: Array.from(state.nodes.values()),
      links: validLinks,
      refreshTelemetry: state.refreshTelemetry,
    };
  },
  resetDiff: () =>
    set({ pendingDiff: { nodesAdded: [], nodesRemoved: [], linksAdded: [], linksRemoved: [] } }),
  getAndResetDiff: () => {
    const diff = get().pendingDiff;
    set({ pendingDiff: { nodesAdded: [], nodesRemoved: [], linksAdded: [], linksRemoved: [] } });
    return diff;
  },

  addRecentProject: (projectPath, projectName, refreshTelemetry) => {
    set((state) => {
      const normalizedPath = normalizeProjectPath(projectPath);
      const existing = state.recentProjects.find((project) => project.path === normalizedPath);
      const filtered = state.recentProjects.filter((project) => project.path !== normalizedPath);
      const next = [
        {
          path: normalizedPath,
          name: projectName,
          lastOpened: new Date().toISOString(),
          telemetry: refreshTelemetry
            ? buildRecentProjectTelemetrySnapshot(refreshTelemetry)
            : existing?.telemetry,
        },
        ...filtered,
      ].slice(0, 10);
      saveRecentProjects(next);
      return { recentProjects: next };
    });
  },

  updateRecentProjectTelemetry: (projectPath, refreshTelemetry) => {
    set((state) => {
      const normalizedPath = normalizeProjectPath(projectPath);
      const hasProject = state.recentProjects.some((project) => project.path === normalizedPath);

      if (!hasProject) {
        return {};
      }

      const next = state.recentProjects.map((project) =>
        project.path === normalizedPath
          ? {
              ...project,
              telemetry: buildRecentProjectTelemetrySnapshot(refreshTelemetry),
            }
          : project
      );

      saveRecentProjects(next);
      return { recentProjects: next };
    });
  },

  clearRecentProjects: () => {
    saveRecentProjects([]);
    set({ recentProjects: [] });
  },
}));
