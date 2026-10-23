import { useEffect } from 'react';
import { useConnectionStore } from '../store/useStore';

/** Starts the file watcher and websocket for the app's lifetime; returns the graph loader. */
export const useRealtimeConnection = () => {
  const { initializeWatcher, initializeWebSocket, teardownRealtime, fetchGraph } =
    useConnectionStore();

  useEffect(() => {
    initializeWatcher();
    initializeWebSocket();
    return () => teardownRealtime();
  }, [initializeWatcher, initializeWebSocket, teardownRealtime]);

  return { fetchGraph };
};
