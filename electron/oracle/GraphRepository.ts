import { GraphData, oracleStore } from '../store';

export class GraphRepository {
  private cachedGraph: GraphData | null = null;
  private cachedKey = '';

  getGraph(): GraphData {
    const state = oracleStore.getState();
    const cacheKey = `${state.baseDir}|${state.nodeRevision}|${state.linkRevision}`;

    if (this.cachedGraph && this.cachedKey === cacheKey) {
      return this.cachedGraph;
    }

    const nextGraph = state.getValidGraph();
    this.cachedGraph = nextGraph;
    this.cachedKey = cacheKey;
    return nextGraph;
  }

  invalidate() {
    this.cachedGraph = null;
    this.cachedKey = '';
  }

  getDiffAndReset() {
    this.invalidate();
    return oracleStore.getState().getAndResetDiff();
  }

  clear() {
    oracleStore.getState().clear();
    this.invalidate();
  }
}
