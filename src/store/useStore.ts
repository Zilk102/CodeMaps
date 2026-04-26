import { create } from 'zustand';
import type { LayoutResult } from '../utils/layoutEngine';
import type { GraphData, GraphFilters, GraphNode, LayoutMode } from '../types/graph';

import { WebSocketClient } from '../services/WebSocketClient';

interface StoreState {
  graphData: GraphData | null;
  layoutData: LayoutResult | null;
  selectedNode: GraphNode | null;
  selectedPath: string | null;
  isLoading: boolean;
  error: string | null;
  parsingProgress: { status: string; current: number; total: number; filename: string } | null;

  // Filters
  filters: GraphFilters;
  layoutMode: LayoutMode;
  setFilter: (key: keyof GraphFilters, value: boolean) => void;
  setLayoutMode: (mode: LayoutMode) => void;

  fetchGraph: (path?: string) => Promise<void>;
  setSelectedNode: (node: GraphNode | null) => void;
  setSelectedPath: (path: string | null) => void;
  openProject: () => Promise<void>;
  initializeWatcher: () => void;
  initializeWebSocket: () => void;
  setParsingProgress: (
    progress: { status: string; current: number; total: number; filename: string } | null
  ) => void;
  closeProject: () => void;
  isMcpSettingsOpen: boolean;
  setMcpSettingsOpen: (isOpen: boolean) => void;
  setLayoutData: (data: LayoutResult | null) => void;
}

export const useStore = create<StoreState>((set, get) => {
  let isWatcherInitialized = false;

  return {
    graphData: null,
    layoutData: null,
    selectedNode: null,
    selectedPath: null,
    isLoading: false,
    error: null,
    parsingProgress: null,
    isMcpSettingsOpen: false,

    filters: {
      showDirectories: true,
      showFiles: true,
      showFunctions: false,
      showClasses: false,
      showADR: true,
      showEdges: true,
    },
    layoutMode: 'hierarchy',
    setFilter: (key, value) => set((state) => ({ filters: { ...state.filters, [key]: value } })),
    setLayoutMode: (mode) => set({ layoutMode: mode }),

    setMcpSettingsOpen: (isOpen) => set({ isMcpSettingsOpen: isOpen }),
    setLayoutData: (data) => set({ layoutData: data }),
    setParsingProgress: (progress) => set({ parsingProgress: progress }),
    closeProject: () =>
      set({ graphData: null, layoutData: null, selectedNode: null, selectedPath: null }),

    initializeWatcher: () => {
      if (isWatcherInitialized) return;
      isWatcherInitialized = true;
      if (window.api?.onGraphUpdate) {
        window.api.onGraphUpdate((data: GraphData) => {
          set({ graphData: data });
        });
      }
      if (window.api?.onParsingProgress) {
        window.api.onParsingProgress((progress: any) => {
          set({ parsingProgress: progress });
        });
      }
    },

    initializeWebSocket: () => {
      WebSocketClient.getInstance().connect();
    },

    fetchGraph: async (path?: string) => {
      set({ isLoading: true, error: null, selectedNode: null, selectedPath: null });
      try {
        const result = await window.api.analyzeProject(path);
        if (result.success && result.data) {
          set({ graphData: result.data, isLoading: false });
        } else {
          set({ error: result.error || 'Unknown error', isLoading: false });
        }
      } catch (error: any) {
        set({ error: error.message, isLoading: false });
      }
    },

    openProject: async () => {
      const dirPath = await window.api.openDirectory?.() ?? await window.api.selectDirectory?.();
      if (dirPath) {
        await get().fetchGraph(dirPath);
      }
    },

    setSelectedNode: (node) => set({ selectedNode: node }),
    setSelectedPath: (path) => set({ selectedPath: path }),
  };
});
