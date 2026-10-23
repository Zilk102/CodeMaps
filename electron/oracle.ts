import { EventEmitter } from 'events';
import * as path from 'path';
import Piscina from 'piscina';
import { oracleStore } from './store';
import { CacheManager } from './oracle/CacheManager';
import { LanguageProfileTracker } from './oracle/LanguageProfileTracker';
import { ChurnAnalyzer } from './oracle/ChurnAnalyzer';
import { FileWatcher } from './oracle/FileWatcher';
import { GraphBuilder } from './oracle/GraphBuilder';
import { getOraclePerformanceConfig } from './oracle/performanceConfig';
import { GraphRepository } from './oracle/GraphRepository';
import { ProjectIndexer } from './oracle/ProjectIndexer';
import { StackGraphEnrichmentService } from './oracle/StackGraphEnrichmentService';
import { cloneIndex } from './analysis/clones/CloneIndex';
import { ImportResolutionService } from './resolution/ImportResolutionService';
import { normalizePath } from './oracle/shared';

export class OracleService extends EventEmitter {
  private pool: Piscina;
  private graphRepository: GraphRepository;
  private cacheManager: CacheManager;
  private churnAnalyzer: ChurnAnalyzer;
  private graphBuilder: GraphBuilder;
  private projectIndexer: ProjectIndexer;
  private fileWatcher: FileWatcher;
  private stackGraphEnrichmentService: StackGraphEnrichmentService;
  private importResolutionService = new ImportResolutionService();
  private readonly performanceConfig = getOraclePerformanceConfig();
  private parsingProgressResetTimeout: ReturnType<typeof setTimeout> | null = null;
  private shutdownPromise: Promise<void> | null = null;
  private readonly languageProfile = new LanguageProfileTracker();

  constructor() {
    super();
    const isTest = process.env.NODE_ENV === 'test' || process.env.VITEST;
    const workerPath = isTest
      ? path.join(__dirname, '..', 'dist-electron', 'worker.js')
      : path.join(__dirname, 'worker.js');
    this.pool = new Piscina({
      filename: workerPath,
      minThreads: this.performanceConfig.workerThreads.min,
      maxThreads: this.performanceConfig.workerThreads.max,
    });
    this.graphRepository = new GraphRepository();
    this.cacheManager = new CacheManager(this.performanceConfig);
    this.churnAnalyzer = new ChurnAnalyzer();
    this.graphBuilder = new GraphBuilder();
    this.stackGraphEnrichmentService = new StackGraphEnrichmentService(this.graphBuilder);
    this.projectIndexer = new ProjectIndexer(this.pool, this.graphBuilder, this.performanceConfig);
    this.fileWatcher = new FileWatcher(this.projectIndexer, this.graphBuilder, this.cacheManager);
  }

  /** Resolves when pending file changes have been folded into the graph. */
  public whenIdle() {
    return this.fileWatcher.whenIdle();
  }

  public getGraph() {
    return this.graphRepository.getGraph();
  }

  private emitGraphUpdated() {
    const graph = this.graphRepository.getGraph();
    if (graph.projectRoot && graph.refreshTelemetry) {
      oracleStore
        .getState()
        .updateRecentProjectTelemetry(graph.projectRoot, graph.refreshTelemetry);
    }
    this.emit('graph-updated', graph);
  }

  private clearParsingProgressResetTimeout() {
    if (this.parsingProgressResetTimeout) {
      clearTimeout(this.parsingProgressResetTimeout);
      this.parsingProgressResetTimeout = null;
    }
  }

  public async analyzeProject(baseDir: string) {
    const store = oracleStore.getState();
    const normalizedBaseDir = normalizePath(baseDir);
    this.graphRepository.clear();
    store.setBaseDir(normalizedBaseDir);

    await this.fileWatcher.close();
    this.clearParsingProgressResetTimeout();

    const churnMap = await this.churnAnalyzer.analyze(normalizedBaseDir);
    store.setChurnMap(churnMap);

    const cache = await this.cacheManager.load(normalizedBaseDir);
    const indexResult = await this.projectIndexer.indexProject(
      normalizedBaseDir,
      cache,
      (progress) => this.emit('parsing-progress', progress)
    );

    this.languageProfile.replace(indexResult.languageProfile);
    await this.importResolutionService.resolveAll();
    await this.stackGraphEnrichmentService.rebuild(this.graphRepository.getGraph());
    this.cacheManager.saveDebounced(normalizedBaseDir);

    await this.fileWatcher.start(
      normalizedBaseDir,
      () => this.languageProfile.get(),
      (filePath, delta) => this.languageProfile.adjust(filePath, delta),
      {
        refreshStackGraphEnrichment: async (changedPaths, event) => {
          await this.importResolutionService.resolveAll();
          await this.stackGraphEnrichmentService.rebuildForChangedPaths(
            this.graphRepository.getGraph(),
            changedPaths,
            event
          );
        },
        emitGraphUpdated: () => this.emitGraphUpdated(),
      }
    );

    const projectName = path.basename(normalizedBaseDir);
    oracleStore
      .getState()
      .addRecentProject(
        normalizedBaseDir,
        projectName,
        this.graphRepository.getGraph().refreshTelemetry
      );

    this.emitGraphUpdated();
    // Duplication is found in the background; tools that report it wait for it.
    void cloneIndex.refreshFor(this.graphRepository.getGraph()).catch(() => undefined);
    this.parsingProgressResetTimeout = setTimeout(() => {
      this.parsingProgressResetTimeout = null;
      this.emit('parsing-progress', null);
    }, 2000);

    return this.graphRepository.getGraph();
  }

  public async close() {
    if (this.shutdownPromise) {
      return this.shutdownPromise;
    }

    this.shutdownPromise = (async () => {
      const baseDir = oracleStore.getState().baseDir;

      this.clearParsingProgressResetTimeout();
      await this.fileWatcher.close();
      await this.cacheManager.close(baseDir || undefined);
      await this.pool.destroy();
      this.removeAllListeners();
    })();

    return this.shutdownPromise;
  }
}

export const oracle = new OracleService();
