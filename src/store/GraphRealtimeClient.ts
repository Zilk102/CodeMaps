import type { GraphData } from '../types/graph';

export interface GraphRealtimeHandlers {
  onGraphUpdated: (graphData: GraphData) => void;
  onParsingProgress: (progress: unknown) => void;
}

export class GraphRealtimeClient {
  private static instance: GraphRealtimeClient;
  private ws: WebSocket | null = null;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private isInitialized = false;
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

    if (this.isInitialized) {
      return;
    }

    this.isInitialized = true;
    this.establishConnection();
  }

  private establishConnection() {
    this.ws = new WebSocket('ws://localhost:3005');

    this.ws.onopen = () => {
      console.log('[WS] Connected to Oracle server');
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
        console.error('Failed to parse WS message', error);
      }
    };

    this.ws.onclose = () => {
      console.log('[WS] Disconnected. Reconnecting in 3s...');
      this.ws = null;
      this.isInitialized = false;

      if (this.reconnectTimer) {
        clearTimeout(this.reconnectTimer);
      }

      this.reconnectTimer = setTimeout(() => {
        this.reconnectTimer = null;
        if (!this.handlers) {
          return;
        }

        this.isInitialized = true;
        this.establishConnection();
      }, 3000);
    };
  }
}
