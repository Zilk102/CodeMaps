import { beforeEach, describe, expect, it, vi } from 'vitest';
import { gracefulShutdown } from './shutdown';

describe('gracefulShutdown', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('runs all shutdown steps and logs completion on success', async () => {
    const shutdownAutoUpdater = vi.fn();
    const shutdownMcpServer = vi.fn().mockResolvedValue(undefined);
    const shutdownOracle = vi.fn().mockResolvedValue(undefined);
    const shutdownKuzuProcessManager = vi.fn();
    const logger = {
      info: vi.fn(),
      error: vi.fn(),
    };

    await gracefulShutdown({
      shutdownAutoUpdater,
      shutdownMcpServer,
      shutdownOracle,
      shutdownKuzuProcessManager,
      logger,
    });

    expect(shutdownAutoUpdater).toHaveBeenCalledTimes(1);
    expect(shutdownMcpServer).toHaveBeenCalledTimes(1);
    expect(shutdownOracle).toHaveBeenCalledTimes(1);
    expect(shutdownKuzuProcessManager).toHaveBeenCalledTimes(1);
    expect(logger.error).not.toHaveBeenCalled();
    expect(logger.info).toHaveBeenNthCalledWith(1, '[App] Starting graceful shutdown');
    expect(logger.info).toHaveBeenNthCalledWith(2, '[App] Graceful shutdown completed');
  });

  it('continues shutdown when one step fails', async () => {
    const shutdownAutoUpdater = vi.fn();
    const failure = new Error('mcp shutdown failed');
    const shutdownMcpServer = vi.fn().mockRejectedValue(failure);
    const shutdownOracle = vi.fn().mockResolvedValue(undefined);
    const shutdownKuzuProcessManager = vi.fn();
    const logger = {
      info: vi.fn(),
      error: vi.fn(),
    };

    await gracefulShutdown({
      shutdownAutoUpdater,
      shutdownMcpServer,
      shutdownOracle,
      shutdownKuzuProcessManager,
      logger,
    });

    expect(shutdownAutoUpdater).toHaveBeenCalledTimes(1);
    expect(shutdownMcpServer).toHaveBeenCalledTimes(1);
    expect(shutdownOracle).toHaveBeenCalledTimes(1);
    expect(shutdownKuzuProcessManager).toHaveBeenCalledTimes(1);
    expect(logger.error).toHaveBeenCalledWith('[App] Shutdown step failed:', failure);
    expect(logger.info).toHaveBeenLastCalledWith('[App] Graceful shutdown completed');
  });
});
