import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { useShallow } from 'zustand/react/shallow';
import { createGraphSlice, type GraphSlice } from './slices/graphSlice';
import { createUISlice, type UISlice } from './slices/uiSlice';
import { createConnectionSlice, type ConnectionSlice } from './slices/connectionSlice';
import { createPersistenceSlice, type PersistenceSlice } from './slices/persistenceSlice';
import { getIDBStorage } from './idb-storage';

export type StoreState = GraphSlice & UISlice & ConnectionSlice & PersistenceSlice;

export const useStore = create<StoreState>()(
  persist(
    (...a) => ({
      ...createGraphSlice(...a),
      ...createUISlice(...a),
      ...createConnectionSlice(...a),
      ...createPersistenceSlice(...a),
    }),
    {
      name: 'codemaps-ui-storage',
      storage: createJSONStorage(() => getIDBStorage('codemaps-db', 'ui-store')),
      partialize: (state) => ({
        // Только сохраняем состояние UI
        activeTab: state.activeTab,
        sidebarWidth: state.sidebarWidth,
        layoutMode: state.layoutMode,
        filters: state.filters,
        selectedNode: state.selectedNode,
      }),
    }
  )
);

// Dedicated selectors (hooks) to prevent unnecessary re-renders
export const useGraphStore = () => useStore(useShallow((state) => ({
  graphData: state.graphData,
  isLoading: state.isLoading,
  error: state.error,
  selectedNode: state.selectedNode,
  selectedPath: state.selectedPath,
  filters: state.filters,
  layoutMode: state.layoutMode,
  setFilter: state.setFilter,
  setLayoutMode: state.setLayoutMode,
  setSelectedNode: state.setSelectedNode,
  setSelectedPath: state.setSelectedPath,
  closeProject: state.closeProject,
})));

export const useUIStore = () => useStore(useShallow((state) => ({
  activeTab: state.activeTab,
  sidebarWidth: state.sidebarWidth,
  layoutData: state.layoutData,
  isMcpSettingsOpen: state.isMcpSettingsOpen,
  isToolsPanelOpen: state.isToolsPanelOpen,
  parsingProgress: state.parsingProgress,
  setActiveTab: state.setActiveTab,
  setSidebarWidth: state.setSidebarWidth,
  setLayoutData: state.setLayoutData,
  setMcpSettingsOpen: state.setMcpSettingsOpen,
  toggleToolsPanel: state.toggleToolsPanel,
  setParsingProgress: state.setParsingProgress,
})));

export const useConnectionStore = () => useStore(useShallow((state) => ({
  initializeWatcher: state.initializeWatcher,
  initializeWebSocket: state.initializeWebSocket,
  fetchGraph: state.fetchGraph,
  openProject: state.openProject,
})));

export const usePersistenceStore = () => useStore(useShallow((state) => ({
  persistenceEnabled: state.persistenceEnabled,
  isLoadingGraph: state.isLoadingGraph,
  isSavingGraph: state.isSavingGraph,
  lastSavedGraph: state.lastSavedGraph,
  persistenceError: state.persistenceError,
  setPersistenceEnabled: state.setPersistenceEnabled,
  setLoadingGraph: state.setLoadingGraph,
  setSavingGraph: state.setSavingGraph,
  setLastSavedGraph: state.setLastSavedGraph,
  setPersistenceError: state.setPersistenceError,
  clearPersistenceError: state.clearPersistenceError,
})));
