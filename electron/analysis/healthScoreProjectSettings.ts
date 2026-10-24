/**
 * Adds the project's own settings (accepted legacy debt, config warnings) to a computed health
 * score without changing the score.
 */

import { loadRatchet } from './baseline/baselineService';
import { loadProjectConfig } from './projectConfig/configLoader';
import type { HealthScoreResult } from './healthScoreTypes';

/**
 * Adds what the project's settings say next to the score: the summary of the accepted old debt
 * (ratchet mode with a baseline) and the warnings about its config file. The score itself is left
 * untouched, so it stays an honest measure of the whole code.
 */
export function withProjectSettings(
  result: HealthScoreResult,
  sources: Parameters<typeof loadRatchet>[0]
): HealthScoreResult {
  const ratchet = loadRatchet(sources);
  const { warnings } = loadProjectConfig(sources.graph.projectRoot);
  if (!ratchet && warnings.length === 0) return result;
  return {
    ...result,
    summary: {
      ...result.summary,
      ...(ratchet ? { legacyDebt: ratchet.legacyDebt } : {}),
      ...(warnings.length > 0 ? { configWarnings: warnings } : {}),
    },
  };
}
