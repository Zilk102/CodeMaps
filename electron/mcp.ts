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
import {
  buildMcpStatus,
  McpStatus,
} from './mcp/descriptors';
import { closeMcpRuntime, McpTransportRecord } from './mcp/runtimeShutdown';

import log from 'electron-log/main';

const MCP_HOST = '127.0.0.1';
const MCP_PORT = 3005;
const MCP_PATH = '/mcp';
const MCP_HTTP_URL = `http://${MCP_HOST}:${MCP_PORT}${MCP_PATH}`;
const MCP_WS_URL = `ws://localhost:${MCP_PORT}`;

export type { McpStatus, McpStatusResourceDescriptor, McpStatusToolDescriptor } from './mcp/descriptors';

type McpServiceHandle = {
  server: http.Server;
  getStatus: () => McpStatus;
  close: () => Promise<void>;
};

let mcpService: McpServiceHandle | null = null;

const getMcpStatusInternal = (): McpStatus => {
  return buildMcpStatus(getGraphSnapshot(), {
    host: MCP_HOST,
    port: MCP_PORT,
    path: MCP_PATH,
    endpoint: MCP_HTTP_URL,
    websocketUrl: MCP_WS_URL,
  });
};

export const getMcpStatus = (): McpStatus => {
  return mcpService?.getStatus() || getMcpStatusInternal();
};

export function setupMcpServer() {
  if (mcpService) {
    return mcpService;
  }

  const app = createMcpExpressApp({ host: MCP_HOST });
  app.use(cors());
  app.use(express.json({ limit: '10mb' }));

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
    } catch (error: any) {
      res.status(500).json({ status: 'error', message: error.message });
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
      ...getNodeDependencies(graph, targetId),
    });
  });

  const server = http.createServer(app);
  const wss = new WebSocketServer({ server });
  const clients = new Set<WebSocket>();
  const transports: Record<string, McpTransportRecord> = {};

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

  const handleMcpPost = async (req: express.Request, res: express.Response) => {
    const sessionId = req.headers['mcp-session-id'];

    try {
      let record: McpTransportRecord | undefined;

      if (typeof sessionId === 'string' && transports[sessionId]) {
        record = transports[sessionId];
      } else if (!sessionId && isInitializeRequest(req.body)) {
        const transport = new StreamableHTTPServerTransport({
          sessionIdGenerator: () => randomUUID(),
          onsessioninitialized: (initializedSessionId) => {
            transports[initializedSessionId] = {
              transport,
              server: record!.server,
            };
          },
        });

        transport.onclose = () => {
          const currentSessionId = transport.sessionId;
          if (currentSessionId) {
            delete transports[currentSessionId];
          }
        };

        record = {
          transport,
          server: createMcpServerInstance(),
        };

        await record.server.connect(transport);
        await transport.handleRequest(req, res, req.body);
        return;
      } else {
        res.status(400).json({
          jsonrpc: '2.0',
          error: {
            code: -32000,
            message: 'Bad Request: No valid MCP session id provided',
          },
          id: null,
        });
        return;
      }

      await record.transport.handleRequest(req, res, req.body);
    } catch (error) {
      log.error('Error handling MCP POST request:', error);
      if (!res.headersSent) {
        res.status(500).json({
          jsonrpc: '2.0',
          error: {
            code: -32603,
            message: 'Internal server error',
          },
          id: null,
        });
      }
    }
  };

  const handleMcpGet = async (req: express.Request, res: express.Response) => {
    const sessionId = req.headers['mcp-session-id'];
    if (typeof sessionId !== 'string' || !transports[sessionId]) {
      res.status(400).send('Invalid or missing session ID');
      return;
    }

    await transports[sessionId].transport.handleRequest(req, res);
  };

  const handleMcpDelete = async (req: express.Request, res: express.Response) => {
    const sessionId = req.headers['mcp-session-id'];
    if (typeof sessionId !== 'string' || !transports[sessionId]) {
      res.status(400).send('Invalid or missing session ID');
      return;
    }

    await transports[sessionId].transport.handleRequest(req, res);
  };

  app.post(MCP_PATH, handleMcpPost);
  app.get(MCP_PATH, handleMcpGet);
  app.delete(MCP_PATH, handleMcpDelete);

  const onGraphUpdated = (graphData: ReturnType<typeof oracle.getGraph>) => {
    const diff = oracleStore.getState().getAndResetDiff();
    const message = JSON.stringify({
      type: 'graph-diff',
      payload: {
        graph: graphData,
        diff,
      },
    });

    for (const client of clients) {
      if (client.readyState === WebSocket.OPEN) {
        client.send(message);
      }
    }

    for (const sessionId in transports) {
      const record = transports[sessionId];
      try {
        record.server.server.notification({
          method: 'notifications/resources/list_changed'
        });
        record.server.server.notification({
          method: 'notifications/tools/list_changed'
        });
      } catch (e) {
        log.error(`Failed to send MCP list_changed notification to session ${sessionId}:`, e);
      }
    }
  };

  const onParsingProgress = (progress: unknown) => {
    const message = JSON.stringify({
      type: 'parsing-progress',
      payload: progress,
    });

    for (const client of clients) {
      if (client.readyState === WebSocket.OPEN) {
        client.send(message);
      }
    }
  };

  oracle.on('graph-updated', onGraphUpdated);
  oracle.on('parsing-progress', onParsingProgress);

  server.listen(MCP_PORT, MCP_HOST, () => {
    log.info(`[MCP] Streamable HTTP endpoint: ${MCP_HTTP_URL}`);
    log.info(`[WS] Graph updates endpoint: ${MCP_WS_URL}`);
  });

  const close = async () => {
    await closeMcpRuntime({
      oracle,
      onGraphUpdated,
      onParsingProgress,
      transports,
      clients,
      wss,
      server,
      logger: log,
    });
  };

  mcpService = {
    server,
    getStatus: getMcpStatusInternal,
    close,
  };

  return mcpService;
}

export async function shutdownMcpServer() {
  const service = mcpService;
  if (!service) {
    return;
  }

  mcpService = null;
  await service.close();
}
