import { StateCreator } from 'zustand';
import type { GraphData, GraphFilters, GraphNode, LayoutMode } from '../../types/graph';

export interface GraphSlice {
  graphData: GraphData | null;
  selectedNode: GraphNode | null;
  selectedPath: string | null;
  isLoading: boolean;
  error: string | null;
  parsingProgress: { status: string; current: number; total: number; filename: string } | null;

  filters: GraphFilters;
  layoutMode: LayoutMode;

  setFilter: (key: keyof GraphFilters, value: boolean) => void;
  setLayoutMode: (mode: LayoutMode) => void;
  setParsingProgress: (progress: { status: string; current: number; total: number; filename: string } | null) => void;
  setSelectedNode: (node: GraphNode | null) => void;
  setSelectedPath: (path: string | null) => void;
  closeProject: () => void;
}

export const createGraphSlice: StateCreator<GraphSlice, [], [], GraphSlice> = (set) => ({
  graphData: null,
  selectedNode: null,
  selectedPath: null,
  isLoading: false,
  error: null,
  parsingProgress: null,

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
  setParsingProgress: (progress) => set({ parsingProgress: progress }),
  setSelectedNode: (node) => set({ selectedNode: node }),
  setSelectedPath: (path) => set({ selectedPath: path }),
  closeProject: () => set({ graphData: null, selectedNode: null, selectedPath: null }),
});
