/** Cached read access to the store's graph snapshot. */

import { GraphData, oracleStore } from '../store';

/** Builds the validated graph snapshot only when the store changed, because building it for a large project is costly. */
export class GraphRepository {
  private cachedGraph: GraphData | null = null;
  private cachedKey = '';

  /** Current snapshot; the same object is returned until the project or the node, link or telemetry revision changes. */
  getGraph(): GraphData {
    const state = oracleStore.getState();
    const cacheKey = `${state.baseDir}|${state.nodeRevision}|${state.linkRevision}|${state.telemetryRevision}`;

    if (this.cachedGraph && this.cachedKey === cacheKey) {
      return this.cachedGraph;
    }

    const nextGraph = state.getValidGraph();
    this.cachedGraph = nextGraph;
    this.cachedKey = cacheKey;
    return nextGraph;
  }

  /** Drops the cached snapshot so the next read rebuilds it. */
  invalidate() {
    this.cachedGraph = null;
    this.cachedKey = '';
  }

  /** Returns the changes accumulated in the store since the last call and starts a new diff. */
  getDiffAndReset() {
    this.invalidate();
    return oracleStore.getState().getAndResetDiff();
  }

  /** Empties the store and the cached snapshot. */
  clear() {
    oracleStore.getState().clear();
    this.invalidate();
  }
}
