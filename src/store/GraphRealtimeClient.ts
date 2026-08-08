import type { GraphData } from '../types/graph';

export interface GraphRealtimeHandlers {
  onGraphUpdated: (graphData: GraphData) => void;
  onParsingProgress: (progress: {
    status: string;
    current: number;
    total: number;
    filename: string;
  }) => void;
}

const WS_URL = 'ws://localhost:3005';
const RECONNECT_BASE_DELAY_MS = 1000;
const RECONNECT_MAX_DELAY_MS = 30_000;

export class GraphRealtimeClient {
  private static instance: GraphRealtimeClient;
  private ws: WebSocket | null = null;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private reconnectAttempts = 0;
  private isInitialized = false;
  private isDisposed = false;
  private handlers: GraphRealtimeHandlers | null = null;

  private constructor() {}

  public static getInstance(): GraphRealtimeClient {
    if (!GraphRealtimeClient.instance) {
      GraphRealtimeClient.instance = new GraphRealtimeClient();
    }

    return GraphRealtimeClient.instance;
  }

  public connect(handlers: GraphRealtimeHandlers) {
    this.handlers = handlers;
    this.isDisposed = false;

    if (this.isInitialized) {
      return;
    }

    this.isInitialized = true;
    this.establishConnection();
  }

  public disconnect() {
    this.isDisposed = true;
    this.isInitialized = false;
    this.handlers = null;
    this.clearReconnectTimer();

    if (this.ws) {
      // Detach first: closing fires onclose, which would otherwise schedule a reconnect.
      this.ws.onopen = null;
      this.ws.onmessage = null;
      this.ws.onerror = null;
      this.ws.onclose = null;
      this.ws.close();
      this.ws = null;
    }
  }

  private clearReconnectTimer() {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
  }

  private establishConnection() {
    this.ws = new WebSocket(WS_URL);

    this.ws.onopen = () => {
      this.reconnectAttempts = 0;
    };

    this.ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);

        if (data.type === 'graph-updated') {
          this.handlers?.onGraphUpdated(data.payload);
        } else if (data.type === 'graph-diff') {
          this.handlers?.onGraphUpdated(data.payload.graph);
        } else if (data.type === 'parsing-progress') {
          this.handlers?.onParsingProgress(data.payload);
        }
      } catch (error) {
        console.error('[WS] Failed to parse message', error);
      }
    };

    this.ws.onclose = () => {
      this.ws = null;
      this.isInitialized = false;
      this.scheduleReconnect();
    };
  }

  private scheduleReconnect() {
    if (this.isDisposed || !this.handlers) {
      return;
    }

    this.clearReconnectTimer();

    // Back off so a main process that never comes back does not get hammered
    // once a second for the lifetime of the window.
    const delay = Math.min(
      RECONNECT_BASE_DELAY_MS * 2 ** this.reconnectAttempts,
      RECONNECT_MAX_DELAY_MS
    );
    this.reconnectAttempts += 1;

    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      if (this.isDisposed || !this.handlers) {
        return;
      }

      this.isInitialized = true;
      this.establishConnection();
    }, delay);
  }
}
