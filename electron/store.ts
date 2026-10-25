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
import { GraphDiff, GraphLink, GraphNode, OracleState } from './store/types';

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

/**
 * Actions that add, replace and remove graph nodes, queueing the change in the pending diff.
 *
 * Writes happen in place and only the revision counter is replaced. Copying the whole map (or
 * spreading the whole diff) per inserted node made indexing quadratic: a project that produced
 * ~190k nodes spent most of its time copying maps instead of parsing files. Revision counters are
 * the invalidation signal for derived data, so nothing depends on the collections being replaced.
 */
const nodeActions = (
  set: Setter
): Pick<OracleState, 'upsertNode' | 'removeNode' | 'removeNodesPrefix'> => ({
  upsertNode: (node) => set((state) => commitNodeChange(state, [node], [])),
  removeNode: (id) => set((state) => commitNodeChange(state, [], state.nodes.has(id) ? [id] : [])),
  removeNodesPrefix: (prefix) =>
    set((state) => commitNodeChange(state, [], nodeIdsWithPrefix(state, prefix))),
});

/** Adds and removes nodes in the store's own map and diff, and returns the revision bump (an empty partial when nothing changed). */
const commitNodeChange = (state: OracleState, added: GraphNode[], removedIds: string[]) => {
  if (added.length === 0 && removedIds.length === 0) {
    return {};
  }

  for (const node of added) state.nodes.set(node.id, node);
  for (const id of removedIds) state.nodes.delete(id);
  state.pendingDiff.nodesAdded.push(...added);
  state.pendingDiff.nodesRemoved.push(...removedIds);
  return { nodeRevision: state.nodeRevision + 1 };
};

/** Ids of every node whose id starts with `prefix`, in insertion order. */
const nodeIdsWithPrefix = (state: OracleState, prefix: string): string[] => {
  const matches: string[] = [];
  for (const id of state.nodes.keys()) {
    if (id.startsWith(prefix)) matches.push(id);
  }
  return matches;
};

/** Actions that add, replace and remove graph links, queueing the change in the pending diff. Links are mutated in place for the same reason as nodes. */
const linkActions = (
  set: Setter
): Pick<OracleState, 'addLink' | 'removeLinksBySource' | 'removeLinksBySourceOrTarget'> => ({
  addLink: (link) => set((state) => appendLink(state, link)),
  removeLinksBySource: (source) =>
    set((state) => pruneLinks(state, (link) => link.source === source)),
  removeLinksBySourceOrTarget: (id) =>
    set((state) => pruneLinks(state, (link) => link.source === id || link.target === id)),
});

/** Appends one link and its diff entry in place, then bumps the link revision. */
const appendLink = (state: OracleState, link: GraphLink) => {
  state.links.push(link);
  state.pendingDiff.linksAdded.push(link);
  return { linkRevision: state.linkRevision + 1 };
};

/**
 * Drops every link matching `isRemoved`, records the dropped links in the pending diff and returns
 * the revision bump. Returns an empty partial (and keeps the array untouched) when nothing matched,
 * so unrelated readers are not invalidated.
 */
function pruneLinks(state: OracleState, isRemoved: (link: GraphLink) => boolean) {
  const removed = state.links.filter(isRemoved);
  if (removed.length === 0) {
    return {};
  }

  state.links = state.links.filter((link) => !isRemoved(link));
  state.pendingDiff.linksRemoved.push(...removed);
  return { linkRevision: state.linkRevision + 1 };
}

/** Actions that remove links by type and swap a group of links for a new one. */
const linkBulkActions = (
  set: Setter
): Pick<OracleState, 'removeLinksByTypes' | 'replaceLinks'> => ({
  removeLinksByTypes: (types) =>
    set((state) => pruneLinks(state, (link) => Boolean(link.type && types.includes(link.type)))),
  replaceLinks: (isOwned, links) => set((state) => replaceOwnedLinks(state, isOwned, links)),
});

/** Swaps the links `isOwned` accepts for `links`, recording both sides in the pending diff. */
const replaceOwnedLinks = (
  state: OracleState,
  isOwned: (link: GraphLink) => boolean,
  links: GraphLink[]
) => {
  const removed = state.links.filter(isOwned);
  state.links = [...state.links.filter((link) => !isOwned(link)), ...links];
  state.pendingDiff.linksRemoved.push(...removed);
  state.pendingDiff.linksAdded.push(...links);
  return { linkRevision: state.linkRevision + 1 };
};

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

/** Runs `fn` against `store` instead of the app's store, for everything it awaits (including nested calls). */
export const runWithStore = <T>(store: StoreApi<OracleState>, fn: () => Promise<T>): Promise<T> =>
  scopedStore.run(store, fn);

/** A graph store that belongs to nobody else: used by analyses that must not read or write the open project's graph. */
export const createDetachedStore = () => createOracleStore([]);

/**
 * Runs `fn` against a fresh, empty graph store that is private to it and everything it awaits:
 * the app's own store, its recent-projects file and its watcher are never touched. Used to analyze
 * a project in memory without opening it in the app.
 */
export const runWithIsolatedStore = <T>(fn: () => Promise<T>): Promise<T> =>
  runWithStore(createOracleStore([]), fn);

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
