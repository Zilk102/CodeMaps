/**
 * The local MCP server: Streamable HTTP endpoint for agents, WebSocket feed of graph updates for the UI,
 * and legacy REST routes, all bound to loopback only.
 */

import cors from 'cors';
import express from 'express';
import * as http from 'http';
import { randomUUID } from 'node:crypto';
import { WebSocketServer, WebSocket } from 'ws';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { createMcpExpressApp } from '@modelcontextprotocol/sdk/server/express.js';
import { isInitializeRequest } from '@modelcontextprotocol/sdk/types.js';
import { oracle } from './oracle';
import { oracleStore } from './store';
import { getGraphSnapshot, ensureGraphLoaded, getNodeDependencies } from './mcp/utils';
import { createMcpServerInstance } from './mcp/bootstrap';
import { buildMcpStatus, McpStatus } from './mcp/descriptors';
import { rejectUnknownSession } from './mcp/sessionErrors';
import { McpListenError, watchListenErrors } from './mcp/listenErrors';
import { closeMcpRuntime, McpTransportRecord } from './mcp/runtimeShutdown';

import log from 'electron-log/main';

const MCP_HOST = '127.0.0.1';
const DEFAULT_MCP_PORT = 3005;
// Overridable so a second instance (or a dev build next to an installed one) can coexist.
const MCP_PORT = Number.parseInt(process.env.CODEMAPS_MCP_PORT ?? '', 10) || DEFAULT_MCP_PORT;
const MCP_PATH = '/mcp';
const MCP_HTTP_URL = `http://${MCP_HOST}:${MCP_PORT}${MCP_PATH}`;
const MCP_WS_URL = `ws://localhost:${MCP_PORT}`;

export type {
  McpStatus,
  McpStatusResourceDescriptor,
  McpStatusToolDescriptor,
} from './mcp/descriptors';

type McpServiceHandle = {
  server: http.Server;
  getStatus: () => McpStatus;
  close: () => Promise<void>;
};

let mcpService: McpServiceHandle | null = null;
let listenError: McpListenError | null = null;

/** Status built from the current graph and listen state; used both before the server exists and by the running service. */
const getMcpStatusInternal = (): McpStatus => {
  return buildMcpStatus(getGraphSnapshot(), {
    host: MCP_HOST,
    port: MCP_PORT,
    path: MCP_PATH,
    endpoint: MCP_HTTP_URL,
    websocketUrl: MCP_WS_URL,
    listenError,
  });
};

/** Current MCP status for the UI: delegates to the running service, or reports the configuration (with any listen error) when it is not running. */
export const getMcpStatus = (): McpStatus => {
  return mcpService?.getStatus() || getMcpStatusInternal();
};

/** Whether a browser `Origin` header value points at this machine (localhost, 127.0.0.1 or ::1). Malformed origins are rejected. */
export const isLoopbackOrigin = (origin: string): boolean => {
  try {
    const { hostname } = new URL(origin);
    return (
      hostname === 'localhost' ||
      hostname === '127.0.0.1' ||
      hostname === '[::1]' ||
      hostname === '::1'
    );
  } catch {
    return false;
  }
};

type TransportMap = Record<string, McpTransportRecord>;

// MCP clients are local processes and send no Origin header. Browsers always do,
// so allowing only loopback origins keeps a random web page the user has open from
// reading the indexed codebase off this port.
/** CORS policy that admits requests without an Origin (local MCP clients) and loopback origins only, so web pages cannot read the index; exposes `Mcp-Session-Id`. */
const corsMiddleware = () =>
  cors({
    origin: (origin, callback) => {
      if (!origin || isLoopbackOrigin(origin)) {
        callback(null, true);
        return;
      }
      callback(new Error('Origin not allowed'));
    },
    exposedHeaders: ['Mcp-Session-Id'],
    allowedHeaders: ['Content-Type', 'Accept', 'Authorization', 'Mcp-Session-Id', 'Last-Event-ID'],
  });

/** Registers the pre-MCP REST endpoints `/mcp/status`, `/mcp/context` and `/mcp/dependencies`, kept for older integrations. */
const registerLegacyRoutes = (app: express.Express) => {
  app.get('/mcp/status', (_req, res) => {
    res.json({ status: 'ok', ...getMcpStatusInternal() });
  });

  // Legacy compatibility endpoints
  app.get('/mcp/context', async (_req, res) => {
    try {
      const graph = await ensureGraphLoaded();
      res.json({
        status: 'ok',
        projectRoot: graph.projectRoot,
        context: graph,
        metadata: {
          nodesCount: graph.nodes.length,
          linksCount: graph.links.length,
        },
      });
    } catch (error: unknown) {
      res.status(500).json({
        status: 'error',
        message: error instanceof Error ? error.message : String(error),
      });
    }
  });

  app.get('/mcp/dependencies', async (req, res) => {
    const targetId = req.query.id as string;
    if (!targetId) {
      return res
        .status(400)
        .json({ status: 'error', message: 'Missing target id query parameter' });
    }

    const graph = await ensureGraphLoaded();
    return res.json({
      status: 'ok',
      target: targetId,
      ...getNodeDependencies(graph, targetId, Number.MAX_SAFE_INTEGER),
    });
  });
};

/** Tracks WebSocket clients in `clients` and sends each new client the current graph immediately when a project is open, so it needs no extra request. */
const attachWebSocketClients = (wss: WebSocketServer, clients: Set<WebSocket>) => {
  wss.on('connection', (ws) => {
    clients.add(ws);

    const state = oracleStore.getState();
    if (state.baseDir) {
      ws.send(
        JSON.stringify({
          type: 'graph-updated',
          payload: oracle.getGraph(),
        })
      );
    }

    ws.on('close', () => {
      clients.delete(ws);
    });
  });
};

/** Creates a server and a transport for a new MCP session. The session is stored in `transports` once the client finishes initialization, and removed when the transport closes. */
const createSessionRecord = (transports: TransportMap): McpTransportRecord => {
  // The session callback can fire before the enclosing statement finishes, so the
  // server instance has to exist before the transport is constructed.
  const mcpServer = createMcpServerInstance();
  const transport = new StreamableHTTPServerTransport({
    sessionIdGenerator: () => randomUUID(),
    onsessioninitialized: (initializedSessionId) => {
      transports[initializedSessionId] = {
        transport,
        server: mcpServer,
      };
    },
  });

  transport.onclose = () => {
    const currentSessionId = transport.sessionId;
    if (currentSessionId) {
      delete transports[currentSessionId];
    }
  };

  return { transport, server: mcpServer };
};

/** Answers with a JSON-RPC internal error (HTTP 500) unless a response was already started. */
const sendInternalError = (res: express.Response) => {
  if (res.headersSent) return;
  res.status(500).json({
    jsonrpc: '2.0',
    error: {
      code: -32603,
      message: 'Internal server error',
    },
    id: null,
  });
};

/** Express handler for MCP POST requests: routes them to the session named by `Mcp-Session-Id`, or starts a new session when an initialize request carries no session id. Anything else is rejected with a session error. */
const createPostHandler =
  (transports: TransportMap) => async (req: express.Request, res: express.Response) => {
    const sessionId = req.headers['mcp-session-id'];

    try {
      if (typeof sessionId === 'string' && transports[sessionId]) {
        await transports[sessionId].transport.handleRequest(req, res, req.body);
      } else if (!sessionId && isInitializeRequest(req.body)) {
        const record = createSessionRecord(transports);
        await record.server.connect(record.transport);
        await record.transport.handleRequest(req, res, req.body);
      } else {
        rejectUnknownSession(res, sessionId);
      }
    } catch (error) {
      log.error('Error handling MCP POST request:', error);
      sendInternalError(res);
    }
  };

// GET (SSE stream) and DELETE (session teardown) both just delegate to the session transport.
/** Express handler for GET (event stream) and DELETE (session end): hands the request to the existing session transport, or rejects an unknown session. */
const createSessionHandler =
  (transports: TransportMap) => async (req: express.Request, res: express.Response) => {
    const sessionId = req.headers['mcp-session-id'];
    if (typeof sessionId !== 'string' || !transports[sessionId]) {
      rejectUnknownSession(res, sessionId);
      return;
    }

    await transports[sessionId].transport.handleRequest(req, res);
  };

const registerMcpTransportRoutes = (app: express.Express, transports: TransportMap) => {
  const sessionHandler = createSessionHandler(transports);
  app.post(MCP_PATH, createPostHandler(transports));
  app.get(MCP_PATH, sessionHandler);
  app.delete(MCP_PATH, sessionHandler);
};

const broadcast = (clients: Set<WebSocket>, message: string) => {
  for (const client of clients) {
    if (client.readyState === WebSocket.OPEN) {
      client.send(message);
    }
  }
};

/** Tells every connected MCP session that its resource and tool lists changed, after the graph was updated. A failing session is logged and skipped. */
const notifyListChanged = (transports: TransportMap) => {
  for (const sessionId in transports) {
    const record = transports[sessionId];
    try {
      record.server.server.notification({
        method: 'notifications/resources/list_changed',
      });
      record.server.server.notification({
        method: 'notifications/tools/list_changed',
      });
    } catch (e) {
      log.error(`Failed to send MCP list_changed notification to session ${sessionId}:`, e);
    }
  }
};

/** Builds the oracle event handlers that forward graph updates (with the accumulated diff) and parsing progress to WebSocket clients and MCP sessions. The caller subscribes and unsubscribes them. */
const createGraphListeners = (clients: Set<WebSocket>, transports: TransportMap) => {
  const onGraphUpdated = (graphData: ReturnType<typeof oracle.getGraph>) => {
    const diff = oracleStore.getState().getAndResetDiff();
    broadcast(
      clients,
      JSON.stringify({
        type: 'graph-diff',
        payload: {
          graph: graphData,
          diff,
        },
      })
    );
    notifyListChanged(transports);
  };

  const onParsingProgress = (progress: unknown) => {
    broadcast(clients, JSON.stringify({ type: 'parsing-progress', payload: progress }));
  };

  return { onGraphUpdated, onParsingProgress };
};

/** Records and logs a bind failure once; the HTTP and WebSocket servers report the same error, so repeats of the same kind are ignored. */
const reportListenError = (kind: McpListenError, error: Error) => {
  // The HTTP server and the ws server both report the same failure.
  if (listenError === kind) return;
  listenError = kind;
  log.error(
    kind === 'port_in_use'
      ? `[MCP] Port ${MCP_PORT} is already in use; MCP is unavailable in this instance. Set CODEMAPS_MCP_PORT to use another port.`
      : `[MCP] Server error: ${error.message}`
  );
};

/**
 * Starts the MCP server on 127.0.0.1 (port 3005 unless `CODEMAPS_MCP_PORT` is set) and returns its handle.
 * Idempotent: a second call returns the running service. A bind failure does not throw; it shows up in `getMcpStatus().error`.
 */
export function setupMcpServer() {
  if (mcpService) {
    return mcpService;
  }

  const app = createMcpExpressApp({ host: MCP_HOST });
  app.use(corsMiddleware());
  app.use(express.json({ limit: '10mb' }));
  registerLegacyRoutes(app);

  const server = http.createServer(app);
  const wss = new WebSocketServer({ server });
  const clients = new Set<WebSocket>();
  const transports: TransportMap = {};

  attachWebSocketClients(wss, clients);
  registerMcpTransportRoutes(app, transports);

  const { onGraphUpdated, onParsingProgress } = createGraphListeners(clients, transports);
  oracle.on('graph-updated', onGraphUpdated);
  oracle.on('parsing-progress', onParsingProgress);

  watchListenErrors([server, wss], reportListenError);

  server.listen(MCP_PORT, MCP_HOST, () => {
    log.info(`[MCP] Streamable HTTP endpoint: ${MCP_HTTP_URL}`);
    log.info(`[WS] Graph updates endpoint: ${MCP_WS_URL}`);
  });

  const close = () =>
    closeMcpRuntime({
      oracle,
      onGraphUpdated,
      onParsingProgress,
      transports,
      clients,
      wss,
      server,
      logger: log,
    });

  mcpService = {
    server,
    getStatus: getMcpStatusInternal,
    close,
  };

  return mcpService;
}

/** Stops the MCP server and forgets it; does nothing when it is not running. */
export async function shutdownMcpServer() {
  const service = mcpService;
  if (!service) {
    return;
  }

  mcpService = null;
  await service.close();
}
