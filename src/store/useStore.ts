import { create } from 'zustand';

export interface GraphNode {
  id: string;
  label: string;
  group: number;
  type: string;
  churn: number;
  adr?: string;
  x?: number;
  y?: number;
  z?: number;
}

export interface GraphLink {
  source: string | GraphNode;
  target: string | GraphNode;
  value: number;
}

export interface GraphData {
  projectRoot: string;
  nodes: GraphNode[];
  links: GraphLink[];
}

interface StoreState {
  graphData: GraphData | null;
  selectedNode: GraphNode | null;
  selectedPath: string | null;
  isLoading: boolean;
  error: string | null;
  parsingProgress: { status: string; current: number; total: number; filename: string } | null;
  fetchGraph: (path?: string) => Promise<void>;
  setSelectedNode: (node: GraphNode | null) => void;
  setSelectedPath: (path: string | null) => void;
  openProject: () => Promise<void>;
  initializeWatcher: () => void;
  setParsingProgress: (progress: { status: string; current: number; total: number; filename: string } | null) => void;
}

export const useStore = create<StoreState>((set, get) => {
  let isWatcherInitialized = false;

  return {
    graphData: null,
    selectedNode: null,
    selectedPath: null,
    isLoading: false,
    error: null,
    parsingProgress: null,
    setParsingProgress: (progress) => set({ parsingProgress: progress }),
    
    initializeWatcher: () => {
      if (isWatcherInitialized) return;
      isWatcherInitialized = true;
      if ((window as any).api?.onGraphUpdate) {
        (window as any).api.onGraphUpdate((data: GraphData) => {
          set({ graphData: data });
        });
      }
      if ((window as any).api?.onParsingProgress) {
        (window as any).api.onParsingProgress((progress: any) => {
          set({ parsingProgress: progress });
        });
      }
    },

    fetchGraph: async (path?: string) => {
    set({ isLoading: true, error: null, selectedNode: null, selectedPath: null });
    try {
      const result = await (window as any).api.analyzeProject(path);
      if (result.success) {
        set({ graphData: result.data, isLoading: false });
      } else {
        set({ error: result.error, isLoading: false });
      }
    } catch (error: any) {
      set({ error: error.message, isLoading: false });
    }
  },

  openProject: async () => {
    const dirPath = await (window as any).api.selectDirectory();
    if (dirPath) {
      await get().fetchGraph(dirPath);
    }
  },
  
  setSelectedNode: (node) => set({ selectedNode: node }),
  setSelectedPath: (path) => set({ selectedPath: path })
  };
});