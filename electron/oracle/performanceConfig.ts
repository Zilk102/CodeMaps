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

export const getOraclePerformanceConfig = (): OraclePerformanceConfig => {
  const availableParallelism = getAvailableParallelism();
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
