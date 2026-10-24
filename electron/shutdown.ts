/** Ordered, failure-tolerant application shutdown. */

import log from 'electron-log/main';

/** The teardown actions `gracefulShutdown` runs, injected so the sequence can be tested without Electron. */
export interface ShutdownDependencies {
  shutdownAutoUpdater: () => void;
  shutdownMcpServer: () => Promise<void>;
  shutdownOracle: () => Promise<void>;
  shutdownKuzuProcessManager: () => void;
  logger?: Pick<typeof log, 'info' | 'error'>;
}

/** Stops the auto-updater first, then the MCP server, the oracle and the Kuzu process in parallel. A failing step is logged and never prevents the others from finishing. */
export async function gracefulShutdown({
  shutdownAutoUpdater,
  shutdownMcpServer,
  shutdownOracle,
  shutdownKuzuProcessManager,
  logger = log,
}: ShutdownDependencies): Promise<void> {
  logger.info('[App] Starting graceful shutdown');

  shutdownAutoUpdater();

  const shutdownSteps = [
    shutdownMcpServer(),
    shutdownOracle(),
    Promise.resolve().then(() => shutdownKuzuProcessManager()),
  ];

  const results = await Promise.allSettled(shutdownSteps);
  for (const result of results) {
    if (result.status === 'rejected') {
      logger.error('[App] Shutdown step failed:', result.reason);
    }
  }

  logger.info('[App] Graceful shutdown completed');
}
