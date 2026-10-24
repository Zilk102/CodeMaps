import * as path from 'path';
import Piscina from 'piscina';
import { CacheManager } from './CacheManager';
import { ChurnAnalyzer } from './ChurnAnalyzer';
import { FileWatcher } from './FileWatcher';
import { GraphBuilder } from './GraphBuilder';
import { GraphRepository } from './GraphRepository';
import { LanguageProfileTracker } from './LanguageProfileTracker';
import { getOraclePerformanceConfig } from './performanceConfig';
import { ProjectIndexer } from './ProjectIndexer';
import { StackGraphEnrichmentService } from './StackGraphEnrichmentService';
import { ImportResolutionService } from '../resolution/ImportResolutionService';

/** The collaborators the oracle service orchestrates, wired together. */
export interface OracleParts {
  pool: Piscina;
  graphRepository: GraphRepository;
  cacheManager: CacheManager;
  churnAnalyzer: ChurnAnalyzer;
  graphBuilder: GraphBuilder;
  projectIndexer: ProjectIndexer;
  fileWatcher: FileWatcher;
  stackGraphEnrichmentService: StackGraphEnrichmentService;
  importResolutionService: ImportResolutionService;
  languageProfile: LanguageProfileTracker;
}

function createWorkerPool(performanceConfig: ReturnType<typeof getOraclePerformanceConfig>) {
  const isTest = process.env.NODE_ENV === 'test' || process.env.VITEST;
  const workerPath = isTest
    ? path.join(__dirname, '..', '..', 'dist-electron', 'worker.js')
    : path.join(__dirname, '..', 'worker.js');
  return new Piscina({
    filename: workerPath,
    minThreads: performanceConfig.workerThreads.min,
    maxThreads: performanceConfig.workerThreads.max,
  });
}

export function createOracleParts(): OracleParts {
  const performanceConfig = getOraclePerformanceConfig();
  const pool = createWorkerPool(performanceConfig);
  const graphBuilder = new GraphBuilder();
  const cacheManager = new CacheManager(performanceConfig);
  const projectIndexer = new ProjectIndexer(pool, graphBuilder, performanceConfig);
  return {
    pool,
    graphRepository: new GraphRepository(),
    cacheManager,
    churnAnalyzer: new ChurnAnalyzer(),
    graphBuilder,
    projectIndexer,
    fileWatcher: new FileWatcher(projectIndexer, graphBuilder, cacheManager),
    stackGraphEnrichmentService: new StackGraphEnrichmentService(graphBuilder),
    importResolutionService: new ImportResolutionService(),
    languageProfile: new LanguageProfileTracker(),
  };
}
