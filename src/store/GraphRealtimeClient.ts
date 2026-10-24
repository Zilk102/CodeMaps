// Singleton WebSocket client that receives live graph updates and parsing progress from the main
// process.
import type { GraphData } from '../types/graph';

/**
 * Callbacks the client invokes for pushed events: a new graph snapshot, and progress while files
 * are being parsed.
 */
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

/**
 * Keeps one WebSocket open to the local CodeMaps server (ws://localhost:3005) and reconnects with
 * exponential backoff (1 s up to 30 s) when it drops. Obtain it with getInstance().
 */
export class GraphRealtimeClient {
  private static instance: GraphRealtimeClient;
  private ws: WebSocket | null = null;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private reconnectAttempts = 0;
  private isInitialized = false;
  private isDisposed = false;
  private handlers: GraphRealtimeHandlers | null = null;

  private constructor() {}

  /** Returns the shared client, creating it on first use. */
  public static getInstance(): GraphRealtimeClient {
    if (!GraphRealtimeClient.instance) {
      GraphRealtimeClient.instance = new GraphRealtimeClient();
    }

    return GraphRealtimeClient.instance;
  }

  /**
   * Stores the handlers and opens the socket; calling it again only replaces the handlers while a
   * connection already exists.
   */
  public connect(handlers: GraphRealtimeHandlers) {
    this.handlers = handlers;
    this.isDisposed = false;

    if (this.isInitialized) {
      return;
    }

    this.isInitialized = true;
    this.establishConnection();
  }

  /**
   * Closes the socket for good and cancels any pending reconnect. Handlers are detached first so
   * closing does not trigger a reconnect.
   */
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

  /**
   * Opens the socket and routes graph-updated, graph-diff (uses its full graph) and
   * parsing-progress messages to the handlers; resets the backoff once connected.
   */
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

  /**
   * Schedules the next connection attempt after an exponentially growing delay, unless the client
   * was disconnected.
   */
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
