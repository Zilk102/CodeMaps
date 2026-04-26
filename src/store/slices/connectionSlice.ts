import { StateCreator } from 'zustand';
import { WebSocketClient } from '../../services/WebSocketClient';
import type { GraphSlice } from './graphSlice';

export interface ConnectionSlice {
  initializeWatcher: () => void;
  initializeWebSocket: () => void;
  fetchGraph: (path?: string) => Promise<void>;
  openProject: () => Promise<void>;
}

export const createConnectionSlice: StateCreator<
  GraphSlice & ConnectionSlice,
  [],
  [],
  ConnectionSlice
> = (set, get) => {
  let isWatcherInitialized = false;

  return {
    initializeWatcher: () => {
      if (isWatcherInitialized) return;
      isWatcherInitialized = true;
      if (window.api?.onGraphUpdate) {
        window.api.onGraphUpdate((data) => {
          set({ graphData: data });
        });
      }
      if (window.api?.onParsingProgress) {
        window.api.onParsingProgress((progress) => {
          set({ parsingProgress: progress as { status: string; current: number; total: number; filename: string } });
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
      } catch (error: unknown) {
        set({ error: error instanceof Error ? error.message : 'Unknown error', isLoading: false });
      }
    },

    openProject: async () => {
      const dirPath = await window.api.openDirectory?.() ?? await window.api.selectDirectory?.();
      if (dirPath) {
        await get().fetchGraph(dirPath);
      }
    },
  };
};
