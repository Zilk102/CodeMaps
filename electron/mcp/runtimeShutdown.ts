import * as http from 'http';
import log from 'electron-log/main';
import { WebSocket, WebSocketServer } from 'ws';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';

export type McpTransportRecord = {
  transport: StreamableHTTPServerTransport;
  server: McpServer;
};

export interface McpRuntimeShutdownDependencies {
  oracle: {
    off: (event: string, listener: (...args: any[]) => void) => void;
  };
  onGraphUpdated: unknown;
  onParsingProgress: unknown;
  transports: Record<string, McpTransportRecord>;
  clients: Set<WebSocket>;
  wss: WebSocketServer;
  server: http.Server;
  logger?: Pick<typeof log, 'error'>;
}

export async function closeMcpRuntime({
  oracle,
  onGraphUpdated,
  onParsingProgress,
  transports,
  clients,
  wss,
  server,
  logger = log,
}: McpRuntimeShutdownDependencies): Promise<void> {
  oracle.off('graph-updated', onGraphUpdated as (...args: any[]) => void);
  oracle.off('parsing-progress', onParsingProgress as (...args: any[]) => void);

  const closePromises: Promise<unknown>[] = [];

  for (const sessionId of Object.keys(transports)) {
    const record = transports[sessionId];
    closePromises.push(
      record.transport.close().catch((error) => {
        logger.error(`[MCP] Failed to close transport for session ${sessionId}:`, error);
      })
    );
    closePromises.push(
      record.server.close().catch((error) => {
        logger.error(`[MCP] Failed to close server for session ${sessionId}:`, error);
      })
    );
    delete transports[sessionId];
  }

  for (const client of clients) {
    try {
      client.terminate();
    } catch (error) {
      logger.error('[MCP] Failed to terminate websocket client:', error);
    }
  }
  clients.clear();

  closePromises.push(
    new Promise<void>((resolve) => {
      wss.close(() => resolve());
    })
  );
  closePromises.push(
    new Promise<void>((resolve) => {
      server.close(() => resolve());
    })
  );

  await Promise.allSettled(closePromises);
}
