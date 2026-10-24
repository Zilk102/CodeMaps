/** Tuning of the indexer's thread and concurrency limits, derived from the CPU count and overridable through environment variables. */

import * as os from 'os';

const DEFAULT_PROGRESS_BATCH_SIZE = 10;
const DEFAULT_MAX_WORKER_THREADS = 8;
const DEFAULT_MAX_PARSE_QUEUE_MULTIPLIER = 2;
const DEFAULT_MAX_FILE_STAT_CONCURRENCY = 32;
const DEFAULT_MAX_CACHE_STAT_CONCURRENCY = 16;

const getAvailableParallelism = () => {
  if (typeof os.availableParallelism === 'function') {
    return Math.max(1, os.availableParallelism());
  }

  return Math.max(1, os.cpus().length);
};

const clampInteger = (value: number, min: number, max: number) => {
  if (!Number.isFinite(value)) {
    return min;
  }

  return Math.min(max, Math.max(min, Math.trunc(value)));
};

const readEnvInteger = (name: string) => {
  const raw = process.env[name];
  if (!raw) {
    return undefined;
  }

  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) ? parsed : undefined;
};

/** Resolved limits: worker threads for parsing, how many parses and stats run at once, and how often indexing progress is reported. */
export interface OraclePerformanceConfig {
  availableParallelism: number;
  workerThreads: {
    min: number;
    max: number;
  };
  indexing: {
    parseConcurrency: number;
    fileStatConcurrency: number;
    progressBatchSize: number;
  };
  cache: {
    statConcurrency: number;
  };
}

/** Worker thread bounds: by default at most 8 and one fewer than the CPU count, at least 1; `CODEMAPS_INDEXER_MAX_THREADS` and `CODEMAPS_INDEXER_MIN_THREADS` override them, clamped to a valid range. */
const resolveWorkerThreads = (availableParallelism: number) => {
  const defaultWorkerMax = Math.max(
    1,
    Math.min(DEFAULT_MAX_WORKER_THREADS, availableParallelism - 1 || 1)
  );
  const workerMax = clampInteger(
    readEnvInteger('CODEMAPS_INDEXER_MAX_THREADS') ?? defaultWorkerMax,
    1,
    availableParallelism
  );
  const workerMin = clampInteger(
    readEnvInteger('CODEMAPS_INDEXER_MIN_THREADS') ?? Math.min(2, workerMax),
    1,
    workerMax
  );
  return { workerMin, workerMax };
};

/** Builds the configuration from the machine and the `CODEMAPS_INDEXER_*` / `CODEMAPS_CACHE_STAT_CONCURRENCY` environment variables. Every value is clamped to a safe range. */
export const getOraclePerformanceConfig = (): OraclePerformanceConfig => {
  const availableParallelism = getAvailableParallelism();
  const { workerMin, workerMax } = resolveWorkerThreads(availableParallelism);
  const parseConcurrency = clampInteger(
    readEnvInteger('CODEMAPS_INDEXER_PARSE_CONCURRENCY') ??
      Math.max(workerMax, workerMax * DEFAULT_MAX_PARSE_QUEUE_MULTIPLIER),
    1,
    Math.max(1, workerMax * 4)
  );
  const fileStatConcurrency = clampInteger(
    readEnvInteger('CODEMAPS_INDEXER_STAT_CONCURRENCY') ??
      Math.max(4, Math.min(DEFAULT_MAX_FILE_STAT_CONCURRENCY, availableParallelism * 4)),
    1,
    128
  );
  const cacheStatConcurrency = clampInteger(
    readEnvInteger('CODEMAPS_CACHE_STAT_CONCURRENCY') ??
      Math.max(2, Math.min(DEFAULT_MAX_CACHE_STAT_CONCURRENCY, availableParallelism * 2)),
    1,
    64
  );
  const progressBatchSize = clampInteger(
    readEnvInteger('CODEMAPS_INDEXER_PROGRESS_BATCH_SIZE') ?? DEFAULT_PROGRESS_BATCH_SIZE,
    1,
    1000
  );

  return {
    availableParallelism,
    workerThreads: {
      min: workerMin,
      max: workerMax,
    },
    indexing: {
      parseConcurrency,
      fileStatConcurrency,
      progressBatchSize,
    },
    cache: {
      statConcurrency: cacheStatConcurrency,
    },
  };
};
