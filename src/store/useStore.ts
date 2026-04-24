import { create } from 'zustand';
import { LayoutResult } from '../utils/layoutEngine';

export interface GraphNode {
  id: string;
  label: string;
  group: number;
  type: string;
  churn?: number;
  adr?: string;
  parentId?: string; // Слой Иерархии
  exports?: Array<{
    exportedName: string;
    localName?: string;
    isDefault?: boolean;
  }>;
  x?: number;
  y?: number;
  z?: number;
}

export interface GraphLink {
  source: string | GraphNode;
  target: string | GraphNode;
  value: number;
  type?: 'structure' | 'import' | 'adr' | 'entity';
}

export interface GraphData {
  projectRoot: string;
  nodes: GraphNode[];
  links: GraphLink[];
}

interface StoreState {
  graphData: GraphData | null;
  layoutData: LayoutResult | null;
  selectedNode: GraphNode | null;
  selectedPath: string | null;
  isLoading: boolean;
  error: string | null;
  parsingProgress: { status: string; current: number; total: number; filename: string } | null;
  
  // Filters
  filters: {
    showDirectories: boolean;
    showFiles: boolean;
    showFunctions: boolean;
    showClasses: boolean;
    showADR: boolean;
    showEdges: boolean;
  };
  setFilter: (key: keyof StoreState['filters'], value: boolean) => void;

  fetchGraph: (path?: string) => Promise<void>;
  setSelectedNode: (node: GraphNode | null) => void;
  setSelectedPath: (path: string | null) => void;
  openProject: () => Promise<void>;
  initializeWatcher: () => void;
  initializeWebSocket: () => void;
  setParsingProgress: (progress: { status: string; current: number; total: number; filename: string } | null) => void;
  closeProject: () => void;
  isMcpSettingsOpen: boolean;
  setMcpSettingsOpen: (isOpen: boolean) => void;
  setLayoutData: (data: LayoutResult | null) => void;
}

export const useStore = create<StoreState>((set, get) => {
  let isWatcherInitialized = false;
  let isWsInitialized = false;
  let ws: WebSocket | null = null;

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
    setFilter: (key, value) => set((state) => ({ filters: { ...state.filters, [key]: value } })),

    setMcpSettingsOpen: (isOpen) => set({ isMcpSettingsOpen: isOpen }),
    setLayoutData: (data) => set({ layoutData: data }),
    setParsingProgress: (progress) => set({ parsingProgress: progress }),
    closeProject: () => set({ graphData: null, layoutData: null, selectedNode: null, selectedPath: null }),
    
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

    initializeWebSocket: () => {
      if (isWsInitialized) return;
      isWsInitialized = true;

      const connect = () => {
        ws = new WebSocket('ws://localhost:3005');

        ws.onopen = () => {
          console.log('[WS] Connected to Oracle server');
        };

        ws.onmessage = (event) => {
          try {
            const data = JSON.parse(event.data);
            if (data.type === 'graph-updated') {
              set({ graphData: data.payload });
            } else if (data.type === 'graph-diff') {
              // Инкрементальное обновление (diff)
              const { graph, diff } = data.payload;
              // Для простоты и гарантии консистентности UI пока принимаем полный граф
              // Но архитектурно мы готовы обрабатывать только diff, если граф станет гигантским
              set({ graphData: graph });
            } else if (data.type === 'parsing-progress') {
              set({ parsingProgress: data.payload });
            }
          } catch (e) {
            console.error('Failed to parse WS message', e);
          }
        };

        ws.onclose = () => {
          console.log('[WS] Disconnected. Reconnecting in 3s...');
          isWsInitialized = false;
          setTimeout(connect, 3000);
        };
      };

      connect();
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
