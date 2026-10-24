// The single zustand store, with the UI preferences persisted to IndexedDB and narrow selector
// hooks.
import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { useShallow } from 'zustand/react/shallow';
import { createGraphSlice, type GraphSlice } from './slices/graphSlice';
import { createUISlice, type UISlice } from './slices/uiSlice';
import { createConnectionSlice, type ConnectionSlice } from './slices/connectionSlice';
import { getIDBStorage } from './idb-storage';

/** Full state of the app store: graph, UI and connection slices combined. */
export type StoreState = GraphSlice & UISlice & ConnectionSlice;

/** The named fields of the store state, as one object. */
const pick = <K extends keyof StoreState>(state: StoreState, keys: readonly K[]) =>
  Object.fromEntries(keys.map((key) => [key, state[key]])) as Pick<StoreState, K>;

const PERSISTED_KEYS = [
  'activeTab',
  'sidebarWidth',
  'layoutMode',
  'filters',
  'selectedNode',
] as const;

const GRAPH_KEYS = [
  'graphData',
  'isLoading',
  'error',
  'selectedNode',
  'selectedPath',
  'filters',
  'layoutMode',
  'setFilter',
  'setLayoutMode',
  'setSelectedNode',
  'setSelectedPath',
  'closeProject',
] as const;

const UI_KEYS = [
  'activeTab',
  'sidebarWidth',
  'layoutData',
  'isMcpSettingsOpen',
  'isToolsPanelOpen',
  'parsingProgress',
  'setActiveTab',
  'setSidebarWidth',
  'setLayoutData',
  'setMcpSettingsOpen',
  'toggleToolsPanel',
  'setParsingProgress',
] as const;

const CONNECTION_KEYS = [
  'initializeWatcher',
  'initializeWebSocket',
  'teardownRealtime',
  'fetchGraph',
  'openProject',
] as const;

export const useStore = create<StoreState>()(
  persist(
    (...a) => ({
      ...createGraphSlice(...a),
      ...createUISlice(...a),
      ...createConnectionSlice(...a),
    }),
    {
      name: 'codemaps-ui-storage',
      storage: createJSONStorage(() => getIDBStorage('codemaps-db', 'ui-store')),
      // Only the UI state is persisted
      partialize: (state) => pick(state, PERSISTED_KEYS),
    }
  )
);

// Dedicated selectors (hooks) to prevent unnecessary re-renders
/**
 * Subscribes to the graph state and its actions (graph, selection, filters, layout mode) without
 * re-rendering on unrelated changes.
 */
export const useGraphStore = () => useStore(useShallow((state) => pick(state, GRAPH_KEYS)));

/**
 * Subscribes to the UI state and actions (tabs, panels, sidebar width, layout data, parsing
 * progress).
 */
export const useUIStore = () => useStore(useShallow((state) => pick(state, UI_KEYS)));

/** Subscribes to the connection actions that start live updates and load projects. */
export const useConnectionStore = () =>
  useStore(useShallow((state) => pick(state, CONNECTION_KEYS)));
