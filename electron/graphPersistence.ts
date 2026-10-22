import { GraphData } from './store';
import type { KuzuIntegration as KuzuIntegrationInstance } from './services/KuzuIntegration';

type KuzuIntegrationCtor = new (projectPath: string) => KuzuIntegrationInstance;

interface LoggerLike {
  info: (...args: unknown[]) => void;
  warn: (...args: unknown[]) => void;
  error: (...args: unknown[]) => void;
}

/**
 * Runs persistence one at a time. Every save clears the database and re-inserts the graph, so
 * two saves in flight at once collide on primary keys. While one runs, newer graphs replace
 * each other in a single pending slot: only the latest state is worth writing.
 */
export function createSerializedPersister(run: (graphData: GraphData) => Promise<void>) {
  let running = false;
  let pending: GraphData | null = null;

  return async (graphData: GraphData): Promise<void> => {
    if (running) {
      pending = graphData;
      return;
    }

    running = true;
    try {
      let next: GraphData | null = graphData;
      while (next) {
        pending = null;
        await run(next);
        next = pending;
      }
    } finally {
      running = false;
    }
  };
}

export async function persistGraphToKuzu(
  graphData: GraphData,
  loadKuzuIntegrationCtor: () => Promise<KuzuIntegrationCtor | null>,
  logger: LoggerLike,
  getErrorMessage: (error: unknown) => string
) {
  try {
    const KuzuIntegrationCtor = await loadKuzuIntegrationCtor();
    if (!KuzuIntegrationCtor) {
      logger.warn('[KuzuDB] Persistence skipped because KuzuIntegration is unavailable');
      return;
    }

    const kuzu = new KuzuIntegrationCtor(graphData.projectRoot);
    await kuzu.init();
    await kuzu.storeGraph(graphData);
    const stats = await kuzu.getStats();
    logger.info('[KuzuDB] Graph persisted:', stats);
    await kuzu.close();
  } catch (error: unknown) {
    logger.error('[KuzuDB] Failed to persist graph:', getErrorMessage(error));
  }
}
