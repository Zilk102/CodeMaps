import { GraphData } from './store';
import type { KuzuIntegration as KuzuIntegrationInstance } from './services/KuzuIntegration';

type KuzuIntegrationCtor = new (projectPath: string) => KuzuIntegrationInstance;

interface LoggerLike {
  info: (...args: unknown[]) => void;
  warn: (...args: unknown[]) => void;
  error: (...args: unknown[]) => void;
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
