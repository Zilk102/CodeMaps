/**
 * Analyses of a project that is not the one open in the app.
 *
 * The MCP server and the window share one graph store, so an agent that asked for its own
 * repository used to replace the map the user had open and close that project's file watcher.
 * Everything routed through here runs against a private store and a private worker pool, emits no
 * events and never watches the filesystem, so the app keeps showing the project the user opened.
 */

import type { StoreApi } from 'zustand/vanilla';
import { OracleService } from '../oracle';
import { createDetachedStore, runWithStore } from '../store';
import type { GraphData, OracleState } from '../store';

/** An analysis nobody in the UI is waiting for: no recent-projects entry, no watcher, no shared indexes, cache written inside the private store context. */
const DETACHED_ANALYSIS_OPTIONS = {
  remember: false,
  watch: false,
  backgroundIndexes: false,
  immediateCache: true,
} as const;

let detachedStore: StoreApi<OracleState> | null = null;
let detachedOracle: OracleService | null = null;

/** The private store and worker pool, created on first use so an app that never runs a detached analysis pays nothing for it. */
const getDetachedAnalysis = () => {
  if (!detachedStore || !detachedOracle) {
    detachedStore = createDetachedStore();
    detachedOracle = new OracleService();
  }

  return { store: detachedStore, oracle: detachedOracle };
};

/**
 * Analyzes `projectPath` in a private store and returns its graph. The project open in the app is
 * neither cleared, re-indexed nor watched, and no graph event is emitted for it.
 */
export const analyzeDetachedProject = (projectPath: string): Promise<GraphData> => {
  const { store, oracle } = getDetachedAnalysis();
  return runWithStore(store, () => oracle.analyzeProject(projectPath, DETACHED_ANALYSIS_OPTIONS));
};

/** Stops the private worker pool and forgets its store; safe to call when no detached analysis ever ran. */
export const closeDetachedProjectAnalysis = async () => {
  const oracle = detachedOracle;
  const store = detachedStore;
  detachedOracle = null;
  detachedStore = null;

  if (!oracle || !store) {
    return;
  }

  // Closing inside the private store context keeps the cache flush on the detached project
  // instead of serializing whatever the app has open at shutdown.
  await runWithStore(store, () => oracle.close());
};
