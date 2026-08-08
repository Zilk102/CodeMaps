import {
  RecentProjectTelemetrySnapshot,
  RefreshMode,
  RefreshReason,
  RefreshTelemetry,
  TrendState,
} from './types';

const TELEMETRY_HISTORY_LIMIT = 12;

const pushLimited = <T>(items: T[], value: T) => [...items, value].slice(-TELEMETRY_HISTORY_LIMIT);

const average = (values: number[]) =>
  values.length === 0 ? 0 : values.reduce((sum, value) => sum + value, 0) / values.length;

const computeBatchSizeTrend = (recentBatchSizes: number[]): TrendState => {
  if (recentBatchSizes.length < 4) {
    return 'stable';
  }
  const midpoint = Math.floor(recentBatchSizes.length / 2);
  const firstHalf = average(recentBatchSizes.slice(0, midpoint));
  const secondHalf = average(recentBatchSizes.slice(midpoint));

  if (secondHalf >= firstHalf + 0.75) {
    return 'improving';
  }
  if (secondHalf <= firstHalf - 0.75) {
    return 'degrading';
  }
  return 'stable';
};

const computeLatencyTrend = (recentLatencyMs: number[]): TrendState => {
  if (recentLatencyMs.length < 4) {
    return 'stable';
  }
  const midpoint = Math.floor(recentLatencyMs.length / 2);
  const firstHalf = average(recentLatencyMs.slice(0, midpoint));
  const secondHalf = average(recentLatencyMs.slice(midpoint));

  if (secondHalf >= firstHalf + 8) {
    return 'degrading';
  }
  if (secondHalf <= Math.max(0, firstHalf - 8)) {
    return 'improving';
  }
  return 'stable';
};

const buildRefreshTrends = (
  telemetry: Omit<RefreshTelemetry, 'trends'>
): RefreshTelemetry['trends'] => {
  const totalWatcherFlushes = telemetry.watcher.flushCount || 1;
  const totalEnrichmentRefreshes =
    telemetry.enrichment.skippedRefreshes + telemetry.enrichment.rebuiltRefreshes || 1;
  const coalescingRatio = telemetry.watcher.coalescedFlushes / totalWatcherFlushes;
  const skipRate = telemetry.enrichment.skippedRefreshes / totalEnrichmentRefreshes;
  const runtimePriorityRate =
    telemetry.enrichment.runtimePriorityRebuilds / totalEnrichmentRefreshes;
  const latencyTrend = computeLatencyTrend(telemetry.enrichment.recentLatencyMs);
  const rebuildPressure = telemetry.enrichment.rebuiltRefreshes >= 3;
  const runtimePressure =
    telemetry.enrichment.runtimePriorityRebuilds >= 2 || runtimePriorityRate >= 0.5;
  const latencyPressure =
    latencyTrend === 'degrading' || telemetry.enrichment.avgRefreshLatencyMs >= 50;
  const directoryRebuildPressure =
    telemetry.enrichment.directoryTriggeredRebuilds >= 3 &&
    telemetry.enrichment.avgRefreshLatencyMs >= 20;

  return {
    watcher: {
      coalescingRatio,
      batchSizeTrend: computeBatchSizeTrend(telemetry.watcher.recentBatchSizes),
    },
    enrichment: {
      skipRate,
      runtimePriorityRate,
      latencyTrend,
      degraded: latencyPressure || directoryRebuildPressure || (rebuildPressure && runtimePressure),
    },
  };
};

export const initialRefreshTelemetry: RefreshTelemetry = {
  watcher: {
    flushCount: 0,
    batchedEventCount: 0,
    coalescedFlushes: 0,
    maxBatchSize: 0,
    lastBatchSize: 0,
    lastEvent: null,
    recentBatchSizes: [],
  },
  enrichment: {
    skippedRefreshes: 0,
    rebuiltRefreshes: 0,
    runtimePriorityRebuilds: 0,
    directoryTriggeredRebuilds: 0,
    avgRefreshLatencyMs: 0,
    lastRefreshMode: null,
    lastRefreshReason: null,
    recentLatencyMs: [],
    recentModes: [],
  },
  trends: {
    watcher: {
      coalescingRatio: 0,
      batchSizeTrend: 'stable',
    },
    enrichment: {
      skipRate: 0,
      runtimePriorityRate: 0,
      latencyTrend: 'stable',
      degraded: false,
    },
  },
};

export const recordWatcherFlush = (
  telemetry: RefreshTelemetry,
  batchSize: number,
  event: RefreshTelemetry['watcher']['lastEvent']
): RefreshTelemetry => {
  const next = {
    watcher: {
      flushCount: telemetry.watcher.flushCount + 1,
      batchedEventCount: telemetry.watcher.batchedEventCount + batchSize,
      coalescedFlushes: telemetry.watcher.coalescedFlushes + (batchSize > 1 ? 1 : 0),
      maxBatchSize: Math.max(telemetry.watcher.maxBatchSize, batchSize),
      lastBatchSize: batchSize,
      lastEvent: event,
      recentBatchSizes: pushLimited(telemetry.watcher.recentBatchSizes, batchSize),
    },
    enrichment: telemetry.enrichment,
  };

  return {
    ...next,
    trends: buildRefreshTrends(next),
  };
};

export const recordEnrichmentRefresh = (
  telemetry: RefreshTelemetry,
  entry: {
    mode: RefreshMode;
    reason: RefreshReason;
    durationMs: number;
  }
): RefreshTelemetry => {
  const previousCount =
    telemetry.enrichment.skippedRefreshes + telemetry.enrichment.rebuiltRefreshes;
  const nextCount = previousCount + 1;
  const nextAvgLatency =
    previousCount === 0
      ? entry.durationMs
      : (telemetry.enrichment.avgRefreshLatencyMs * previousCount + entry.durationMs) / nextCount;

  const next = {
    watcher: telemetry.watcher,
    enrichment: {
      skippedRefreshes: telemetry.enrichment.skippedRefreshes + (entry.mode === 'skipped' ? 1 : 0),
      rebuiltRefreshes: telemetry.enrichment.rebuiltRefreshes + (entry.mode === 'rebuilt' ? 1 : 0),
      runtimePriorityRebuilds:
        telemetry.enrichment.runtimePriorityRebuilds +
        (entry.reason === 'stack_runtime_path_changed' ? 1 : 0),
      directoryTriggeredRebuilds:
        telemetry.enrichment.directoryTriggeredRebuilds +
        (entry.reason === 'directory_structure_changed' ? 1 : 0),
      avgRefreshLatencyMs: nextAvgLatency,
      lastRefreshMode: entry.mode,
      lastRefreshReason: entry.reason,
      recentLatencyMs: pushLimited(telemetry.enrichment.recentLatencyMs, entry.durationMs),
      recentModes: pushLimited(telemetry.enrichment.recentModes, entry.mode),
    },
  };

  return {
    ...next,
    trends: buildRefreshTrends(next),
  };
};

export const buildRecentProjectTelemetrySnapshot = (
  refreshTelemetry: RefreshTelemetry
): RecentProjectTelemetrySnapshot => ({
  updatedAt: new Date().toISOString(),
  degraded: refreshTelemetry.trends.enrichment.degraded,
  avgRefreshLatencyMs: refreshTelemetry.enrichment.avgRefreshLatencyMs,
  skipRate: refreshTelemetry.trends.enrichment.skipRate,
  coalescingRatio: refreshTelemetry.trends.watcher.coalescingRatio,
  runtimePriorityRate: refreshTelemetry.trends.enrichment.runtimePriorityRate,
  latencyTrend: refreshTelemetry.trends.enrichment.latencyTrend,
  batchSizeTrend: refreshTelemetry.trends.watcher.batchSizeTrend,
  maxBatchSize: refreshTelemetry.watcher.maxBatchSize,
  lastBatchSize: refreshTelemetry.watcher.lastBatchSize,
  lastRefreshMode: refreshTelemetry.enrichment.lastRefreshMode,
  lastRefreshReason: refreshTelemetry.enrichment.lastRefreshReason,
});
