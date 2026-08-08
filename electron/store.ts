import { createStore } from 'zustand/vanilla';
import { buildValidGraphSnapshot, normalizeCachedNodes } from './store/graphSnapshot';
import {
  loadRecentProjects,
  normalizeProjectPath,
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
