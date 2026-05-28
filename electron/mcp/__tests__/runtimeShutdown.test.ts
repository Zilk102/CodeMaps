import { describe, expect, it, vi } from 'vitest';
import { closeMcpRuntime, type McpTransportRecord } from '../runtimeShutdown';

describe('closeMcpRuntime', () => {
  it('closes all MCP runtime resources and clears state', async () => {
    const oracle = { off: vi.fn() };
    const onGraphUpdated = vi.fn();
    const onParsingProgress = vi.fn();
    const transportClose = vi.fn().mockResolvedValue(undefined);
    const serverClose = vi.fn().mockResolvedValue(undefined);
    const transports: Record<string, McpTransportRecord> = {
      sessionA: {
        transport: { close: transportClose } as unknown as McpTransportRecord['transport'],
        server: { close: serverClose } as unknown as McpTransportRecord['server'],
      },
    };
    const client = { terminate: vi.fn() };
    const clients = new Set([client as never]);
    const closeWss = vi.fn((cb: () => void) => cb());
    const closeServer = vi.fn((cb: () => void) => cb());
    const wss = {
      close: closeWss,
    };
    const server = {
      close: closeServer,
    };
    const logger = {
      error: vi.fn(),
    };

    await closeMcpRuntime({
      oracle,
      onGraphUpdated,
      onParsingProgress,
      transports,
      clients,
      wss: wss as never,
      server: server as never,
      logger,
    });

    expect(oracle.off).toHaveBeenCalledWith('graph-updated', onGraphUpdated);
    expect(oracle.off).toHaveBeenCalledWith('parsing-progress', onParsingProgress);
    expect(transportClose).toHaveBeenCalledTimes(1);
    expect(serverClose).toHaveBeenCalledTimes(1);
    expect(client.terminate).toHaveBeenCalledTimes(1);
    expect(closeWss).toHaveBeenCalledTimes(1);
    expect(closeServer).toHaveBeenCalledTimes(1);
    expect(Object.keys(transports)).toHaveLength(0);
    expect(clients.size).toBe(0);
    expect(logger.error).not.toHaveBeenCalled();
  });

  it('continues shutdown when transport and client termination fail', async () => {
    const oracle = { off: vi.fn() };
    const failure = new Error('transport close failed');
    const transportClose = vi.fn().mockRejectedValue(failure);
    const serverClose = vi.fn().mockResolvedValue(undefined);
    const transports: Record<string, McpTransportRecord> = {
      brokenSession: {
        transport: { close: transportClose } as unknown as McpTransportRecord['transport'],
        server: { close: serverClose } as unknown as McpTransportRecord['server'],
      },
    };
    const clientFailure = new Error('client terminate failed');
    const client = {
      terminate: vi.fn(() => {
        throw clientFailure;
      }),
    };
    const clients = new Set([client as never]);
    const closeWss = vi.fn((cb: () => void) => cb());
    const closeServer = vi.fn((cb: () => void) => cb());
    const wss = {
      close: closeWss,
    };
    const server = {
      close: closeServer,
    };
    const logger = {
      error: vi.fn(),
    };

    await closeMcpRuntime({
      oracle,
      onGraphUpdated: vi.fn(),
      onParsingProgress: vi.fn(),
      transports,
      clients,
      wss: wss as never,
      server: server as never,
      logger,
    });

    expect(serverClose).toHaveBeenCalledTimes(1);
    expect(closeWss).toHaveBeenCalledTimes(1);
    expect(closeServer).toHaveBeenCalledTimes(1);
    expect(logger.error).toHaveBeenCalledWith(
      '[MCP] Failed to terminate websocket client:',
      clientFailure
    );
    expect(logger.error).toHaveBeenCalledWith(
      '[MCP] Failed to close transport for session brokenSession:',
      failure
    );
  });
});
