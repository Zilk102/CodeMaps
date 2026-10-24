import { StateCreator } from 'zustand';
import { GraphRealtimeClient } from '../GraphRealtimeClient';
import type { GraphSlice } from './graphSlice';

export interface ConnectionSlice {
  initializeWatcher: () => void;
  initializeWebSocket: () => void;
  teardownRealtime: () => void;
  fetchGraph: (path?: string) => Promise<void>;
  openProject: () => Promise<void>;
}

type SliceCreator = StateCreator<GraphSlice & ConnectionSlice, [], [], ConnectionSlice>;
type Setter = Parameters<SliceCreator>[0];
type Getter = Parameters<SliceCreator>[1];

const errorMessage = (error: unknown) => (error instanceof Error ? error.message : 'Unknown error');

const subscribeToIpc = (set: Setter): Array<() => void> =>
  [
    window.api?.onGraphUpdate?.((data) => set({ graphData: data })),
    window.api?.onParsingProgress?.((progress) => set({ parsingProgress: progress })),
  ].filter((unsubscribe): unsubscribe is () => void => typeof unsubscribe === 'function');

const connectWebSocket = (set: Setter) =>
  GraphRealtimeClient.getInstance().connect({
    onGraphUpdated: (graphData) => set({ graphData }),
    onParsingProgress: (progress) => set({ parsingProgress: progress }),
  });

const loadGraph = async (set: Setter, path?: string) => {
  set({ isLoading: true, error: null, selectedNode: null, selectedPath: null });
  try {
    const result = await window.api.analyzeProject(path);
    if (result.success && result.data) {
      set({ graphData: result.data, isLoading: false });
    } else {
      set({ error: result.error || 'Unknown error', isLoading: false });
    }
  } catch (error: unknown) {
    set({ error: errorMessage(error), isLoading: false });
  }
};

const pickProjectDirectory = async () =>
  (await window.api.openDirectory?.()) ?? (await window.api.selectDirectory?.());

const openProjectDirectory = async (get: Getter) => {
  const dirPath = await pickProjectDirectory();
  if (dirPath) await get().fetchGraph(dirPath);
};

export const createConnectionSlice: SliceCreator = (set, get) => {
  let unsubscribeIpc: Array<() => void> = [];

  return {
    initializeWatcher: () => {
      if (unsubscribeIpc.length === 0) unsubscribeIpc = subscribeToIpc(set);
    },
    initializeWebSocket: () => connectWebSocket(set),
    teardownRealtime: () => {
      for (const unsubscribe of unsubscribeIpc) unsubscribe();
      unsubscribeIpc = [];
      GraphRealtimeClient.getInstance().disconnect();
    },
    fetchGraph: (path) => loadGraph(set, path),
    openProject: () => openProjectDirectory(get),
  };
};
