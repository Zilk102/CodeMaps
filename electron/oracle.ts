import { EventEmitter } from 'events';
import * as path from 'path';
import Piscina from 'piscina';
import { oracleStore } from './store';
import { getLanguageByExtension } from './parsing/languageRegistry';
import { ProjectLanguageProfile } from './parsing/types';
import { CacheManager } from './oracle/CacheManager';
import { ChurnAnalyzer } from './oracle/ChurnAnalyzer';
import { FileWatcher } from './oracle/FileWatcher';
import { GraphBuilder } from './oracle/GraphBuilder';
import { getOraclePerformanceConfig } from './oracle/performanceConfig';
import { GraphRepository } from './oracle/GraphRepository';
import { ProjectIndexer } from './oracle/ProjectIndexer';
import { StackGraphEnrichmentService } from './oracle/StackGraphEnrichmentService';
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
  private readonly performanceConfig = getOraclePerformanceConfig();
  private parsingProgressResetTimeout: ReturnType<typeof setTimeout> | null = null;
  private shutdownPromise: Promise<void> | null = null;
  private projectLanguageProfile: ProjectLanguageProfile = {
    activeLanguageIds: [],
    languageFileCounts: {},
  };

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

  public getGraph() {
    return this.graphRepository.getGraph();
  }

  private updateLanguageCount(filePath: string, delta: 1 | -1) {
    const language = getLanguageByExtension(path.extname(filePath).toLowerCase());
    if (!language) return;

    const nextCounts = { ...this.projectLanguageProfile.languageFileCounts };
    const nextCount = (nextCounts[language.id] || 0) + delta;

    if (nextCount <= 0) {
      delete nextCounts[language.id];
    } else {
      nextCounts[language.id] = nextCount;
    }

    this.projectLanguageProfile = {
      languageFileCounts: nextCounts,
      activeLanguageIds: Object.entries(nextCounts)
        .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
        .map(([languageId]) => languageId),
    };
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

    this.projectLanguageProfile = indexResult.languageProfile;
    await this.stackGraphEnrichmentService.rebuild(this.graphRepository.getGraph());
    this.cacheManager.saveDebounced(normalizedBaseDir);

    await this.fileWatcher.start(
      normalizedBaseDir,
      () => this.projectLanguageProfile,
      (filePath, delta) => this.updateLanguageCount(filePath, delta),
      {
        refreshStackGraphEnrichment: async (changedPaths, event) => {
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
