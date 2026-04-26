import { useStore } from '../store/useStore';

export class WebSocketClient {
  private static instance: WebSocketClient;
  private ws: WebSocket | null = null;
  private isInitialized = false;

  private constructor() {}

  public static getInstance(): WebSocketClient {
    if (!WebSocketClient.instance) {
      WebSocketClient.instance = new WebSocketClient();
    }
    return WebSocketClient.instance;
  }

  public connect() {
    if (this.isInitialized) return;
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
        const store = useStore.getState();
        
        if (data.type === 'graph-updated') {
          useStore.setState({ graphData: data.payload });
        } else if (data.type === 'graph-diff') {
          // Incremental update (diff)
          // For simplicity and UI consistency guarantee, we currently accept the full graph.
          // Architecturally, we are ready to process only diffs if the graph becomes gigantic.
          useStore.setState({ graphData: data.payload.graph });
        } else if (data.type === 'parsing-progress') {
          store.setParsingProgress(data.payload);
        }
      } catch (e) {
        console.error('Failed to parse WS message', e);
      }
    };

    this.ws.onclose = () => {
      console.log('[WS] Disconnected. Reconnecting in 3s...');
      this.isInitialized = false;
      setTimeout(() => this.establishConnection(), 3000);
    };
  }
}
