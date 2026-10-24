/** The in-memory graph store (nodes, links, churn, refresh telemetry, recent projects) shared by the indexer, the watcher and the MCP tools. */

import { AsyncLocalStorage } from 'async_hooks';
import { createStore, type StoreApi } from 'zustand/vanilla';
import { buildValidGraphSnapshot, normalizeCachedNodes } from './store/graphSnapshot';
import {
  loadRecentProjects,
  normalizeProjectPath,
  projectPathKey,
  saveRecentProjects,
} from './store/recentProjects';
import {
  buildRecentProjectTelemetrySnapshot,
  initialRefreshTelemetry,
  recordEnrichmentRefresh as applyEnrichmentRefresh,
  recordWatcherFlush as applyWatcherFlush,
} from './store/telemetry';
import { GraphDiff, OracleState } from './store/types';

export * from './store/types';

const emptyDiff = (): GraphDiff => ({
  nodesAdded: [],
  nodesRemoved: [],
  linksAdded: [],
  linksRemoved: [],
});

type Setter = StoreApi<OracleState>['setState'];
type Getter = StoreApi<OracleState>['getState'];

/** Actions that set the base directory and record refresh telemetry. */
const telemetryActions = (
  set: Setter
): Pick<
  OracleState,
  | 'setBaseDir'
  | 'setChurnMap'
  | 'resetRefreshTelemetry'
  | 'recordWatcherFlush'
  | 'recordEnrichmentRefresh'
> => ({
  setBaseDir: (dir) => set({ baseDir: dir }),
  setChurnMap: (map) => set({ churnMap: map }),
  resetRefreshTelemetry: () =>
    set((state) => ({
      refreshTelemetry: initialRefreshTelemetry,
      telemetryRevision: state.telemetryRevision + 1,
    })),
  recordWatcherFlush: (batchSize, event) =>
    set((state) => {
      const refreshTelemetry = applyWatcherFlush(state.refreshTelemetry, batchSize, event);
      return {
        refreshTelemetry,
        telemetryRevision: state.telemetryRevision + 1,
      };
    }),
  recordEnrichmentRefresh: ({ mode, reason, durationMs }) =>
    set((state) => {
      const refreshTelemetry = applyEnrichmentRefresh(state.refreshTelemetry, {
        mode,
        reason,
        durationMs,
      });
      return {
        refreshTelemetry,
        telemetryRevision: state.telemetryRevision + 1,
      };
    }),
});

/** Actions that add, replace and remove graph nodes, queueing the change in the pending diff. */
const nodeActions = (
  set: Setter
): Pick<OracleState, 'upsertNode' | 'removeNode' | 'removeNodesPrefix'> => ({
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
});

/** Actions that add, replace and remove graph links, queueing the change in the pending diff. */
const linkActions = (
  set: Setter
): Pick<OracleState, 'addLink' | 'removeLinksBySource' | 'removeLinksBySourceOrTarget'> => ({
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
});

/** Actions that remove links by type and swap a group of links for a new one. */
const linkBulkActions = (
  set: Setter
): Pick<OracleState, 'removeLinksByTypes' | 'replaceLinks'> => ({
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
  replaceLinks: (isOwned, links) =>
    set((state) => {
      const toRemove = state.links.filter(isOwned);
      return {
        links: [...state.links.filter((l) => !isOwned(l)), ...links],
        linkRevision: state.linkRevision + 1,
        pendingDiff: {
          ...state.pendingDiff,
          linksRemoved: [...state.pendingDiff.linksRemoved, ...toRemove],
          linksAdded: [...state.pendingDiff.linksAdded, ...links],
        },
      };
    }),
});

/** Actions that restore, clear and snapshot the graph and drain the pending diff. */
const lifecycleActions = (
  set: Setter,
  get: Getter
): Pick<
  OracleState,
  'restoreCache' | 'clear' | 'getValidGraph' | 'resetDiff' | 'getAndResetDiff'
> => ({
  restoreCache: (nodes, links) =>
    set((state) => {
      const baseDir = state.baseDir.replace(/\\/g, '/');
      const normalizedNodes = normalizeCachedNodes(baseDir, nodes);
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
  getValidGraph: () => buildValidGraphSnapshot(get()),
  resetDiff: () => set({ pendingDiff: emptyDiff() }),
  getAndResetDiff: () => {
    const diff = get().pendingDiff;
    set({ pendingDiff: emptyDiff() });
    return diff;
  },
});

/** Actions that keep the persisted recent-projects list. */
const recentProjectActions = (
  set: Setter
): Pick<
  OracleState,
  'addRecentProject' | 'updateRecentProjectTelemetry' | 'clearRecentProjects'
> => ({
  addRecentProject: (projectPath, projectName, refreshTelemetry) => {
    set((state) => {
      const normalizedPath = normalizeProjectPath(projectPath);
      const existing = state.recentProjects.find(
        (project) => projectPathKey(project.path) === projectPathKey(normalizedPath)
      );
      const filtered = state.recentProjects.filter(
        (project) => projectPathKey(project.path) !== projectPathKey(normalizedPath)
      );
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
      const hasProject = state.recentProjects.some(
        (project) => projectPathKey(project.path) === projectPathKey(normalizedPath)
      );

      if (!hasProject) {
        return {};
      }

      const next = state.recentProjects.map((project) =>
        projectPathKey(project.path) === projectPathKey(normalizedPath)
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
});

/** Builds a store holding a live graph; `recentProjects` seeds the (disk-persisted) recent list. */
const createOracleStore = (recentProjects: OracleState['recentProjects']) =>
  createStore<OracleState>()((set, get) => ({
    baseDir: '',
    nodes: new Map(),
    links: [],
    churnMap: new Map(),
    nodeRevision: 0,
    linkRevision: 0,
    telemetryRevision: 0,
    pendingDiff: { nodesAdded: [], nodesRemoved: [], linksAdded: [], linksRemoved: [] },
    recentProjects,
    refreshTelemetry: initialRefreshTelemetry,
    ...telemetryActions(set),
    ...nodeActions(set),
    ...linkActions(set),
    ...linkBulkActions(set),
    ...lifecycleActions(set, get),
    ...recentProjectActions(set),
  }));

const appStore = createOracleStore(loadRecentProjects());
const scopedStore = new AsyncLocalStorage<StoreApi<OracleState>>();

/**
 * Runs `fn` against a fresh, empty graph store that is private to it and everything it awaits:
 * the app's own store, its recent-projects file and its watcher are never touched. Used to analyze
 * a project in memory without opening it in the app.
 */
export const runWithIsolatedStore = <T>(fn: () => Promise<T>): Promise<T> =>
  scopedStore.run(createOracleStore([]), fn);

const activeStore = () => scopedStore.getStore() ?? appStore;

/**
 * The live graph store (a vanilla zustand store). Mutations bump revision counters (used to invalidate cached snapshots) and record a pending diff
 * that `getAndResetDiff` hands to subscribers; the recent-projects list is persisted to disk on every change. Inside `runWithIsolatedStore` it resolves to the isolated store instead.
 */
export const oracleStore: StoreApi<OracleState> = {
  getState: () => activeStore().getState(),
  getInitialState: () => activeStore().getInitialState(),
  setState: ((...args: Parameters<StoreApi<OracleState>['setState']>) =>
    activeStore().setState(...args)) as StoreApi<OracleState>['setState'],
  subscribe: (listener) => activeStore().subscribe(listener),
};
