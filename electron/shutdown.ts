import log from 'electron-log/main';

export interface ShutdownDependencies {
  shutdownAutoUpdater: () => void;
  shutdownMcpServer: () => Promise<void>;
  shutdownOracle: () => Promise<void>;
  shutdownKuzuProcessManager: () => void;
  logger?: Pick<typeof log, 'info' | 'error'>;
}

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
