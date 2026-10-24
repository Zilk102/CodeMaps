import { EventEmitter } from 'events';
import * as path from 'path';
import type Piscina from 'piscina';
import { oracleStore } from './store';
import type { CacheManager } from './oracle/CacheManager';
import type { FileWatcher } from './oracle/FileWatcher';
import type { StackGraphEnrichmentService } from './oracle/StackGraphEnrichmentService';
import { createOracleParts, type OracleParts } from './oracle/oracleWiring';
import { cloneIndex } from './analysis/clones/CloneIndex';
import { normalizePath } from './oracle/shared';

export class OracleService extends EventEmitter {
  private pool: Piscina;
  private cacheManager: CacheManager;
  private fileWatcher: FileWatcher;
  private stackGraphEnrichmentService: StackGraphEnrichmentService;
  private readonly parts: OracleParts;
  private parsingProgressResetTimeout: ReturnType<typeof setTimeout> | null = null;
  private shutdownPromise: Promise<void> | null = null;

  constructor() {
    super();
    this.parts = createOracleParts();
    this.pool = this.parts.pool;
    this.cacheManager = this.parts.cacheManager;
    this.fileWatcher = this.parts.fileWatcher;
    this.stackGraphEnrichmentService = this.parts.stackGraphEnrichmentService;
  }

  /** Resolves when pending file changes have been folded into the graph. */
  public whenIdle() {
    return this.fileWatcher.whenIdle();
  }

  public getGraph() {
    return this.parts.graphRepository.getGraph();
  }

  private emitGraphUpdated() {
    const graph = this.getGraph();
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
    const normalizedBaseDir = normalizePath(baseDir);
    await this.resetForProject(normalizedBaseDir);
    await this.indexProject(normalizedBaseDir);
    await this.startWatching(normalizedBaseDir);

    oracleStore
      .getState()
      .addRecentProject(
        normalizedBaseDir,
        path.basename(normalizedBaseDir),
        this.getGraph().refreshTelemetry
      );

    this.emitGraphUpdated();
    // Duplication is found in the background; tools that report it wait for it.
    void cloneIndex.refreshFor(this.getGraph()).catch(() => undefined);
    this.parsingProgressResetTimeout = setTimeout(() => {
      this.parsingProgressResetTimeout = null;
      this.emit('parsing-progress', null);
    }, 2000);

    return this.getGraph();
  }

  private async resetForProject(baseDir: string) {
    const store = oracleStore.getState();
    this.parts.graphRepository.clear();
    store.setBaseDir(baseDir);

    await this.fileWatcher.close();
    this.clearParsingProgressResetTimeout();

    store.setChurnMap(await this.parts.churnAnalyzer.analyze(baseDir));
  }

  private async indexProject(baseDir: string) {
    const cache = await this.cacheManager.load(baseDir);
    const indexResult = await this.parts.projectIndexer.indexProject(baseDir, cache, (progress) =>
      this.emit('parsing-progress', progress)
    );

    this.parts.languageProfile.replace(indexResult.languageProfile);
    await this.parts.importResolutionService.resolveAll();
    await this.parts.stackGraphEnrichmentService.rebuild(this.getGraph());
    this.cacheManager.saveDebounced(baseDir);
  }

  private async startWatching(baseDir: string) {
    const { languageProfile, importResolutionService } = this.parts;
    const stackGraphEnrichmentService = this.stackGraphEnrichmentService;
    await this.fileWatcher.start(
      baseDir,
      () => languageProfile.get(),
      (filePath, delta) => languageProfile.adjust(filePath, delta),
      {
        refreshStackGraphEnrichment: async (changedPaths, event) => {
          await importResolutionService.resolveAll();
          await stackGraphEnrichmentService.rebuildForChangedPaths(
            this.getGraph(),
            changedPaths,
            event
          );
        },
        emitGraphUpdated: () => this.emitGraphUpdated(),
      }
    );
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
