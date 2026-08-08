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

export const createConnectionSlice: StateCreator<
  GraphSlice & ConnectionSlice,
  [],
  [],
  ConnectionSlice
> = (set, get) => {
  let unsubscribeIpc: Array<() => void> = [];

  return {
    initializeWatcher: () => {
      if (unsubscribeIpc.length > 0) return;

      unsubscribeIpc = [
        window.api?.onGraphUpdate?.((data) => {
          set({ graphData: data });
        }),
        window.api?.onParsingProgress?.((progress) => {
          set({ parsingProgress: progress });
        }),
      ].filter((unsubscribe): unsubscribe is () => void => typeof unsubscribe === 'function');
    },

    initializeWebSocket: () => {
      GraphRealtimeClient.getInstance().connect({
        onGraphUpdated: (graphData) => {
          set({ graphData });
        },
        onParsingProgress: (progress) => {
          set({ parsingProgress: progress });
        },
      });
    },

    teardownRealtime: () => {
      for (const unsubscribe of unsubscribeIpc) unsubscribe();
      unsubscribeIpc = [];
      GraphRealtimeClient.getInstance().disconnect();
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
      const dirPath =
        (await window.api.openDirectory?.()) ?? (await window.api.selectDirectory?.());
      if (dirPath) {
        await get().fetchGraph(dirPath);
      }
    },
  };
};
