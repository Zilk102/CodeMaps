/** The oracle: owns the project graph and coordinates indexing, caching, file watching and enrichment. */

import { EventEmitter } from 'events';
import * as path from 'path';
import type Piscina from 'piscina';
import { oracleStore } from './store';
import type { CacheManager } from './oracle/CacheManager';
import type { FileWatcher } from './oracle/FileWatcher';
import type { StackGraphEnrichmentService } from './oracle/StackGraphEnrichmentService';
import { createOracleParts, type OracleParts } from './oracle/oracleWiring';
import { cloneIndex } from './analysis/clones/CloneIndex';
import { documentationIndex } from './analysis/documentation';
import { normalizePath } from './oracle/shared';

/**
 * Facade over the indexing pipeline. Emits `graph-updated` with the graph after each analysis or file refresh,
 * and `parsing-progress` with progress objects, followed by `null` once parsing is finished.
 */
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

  /** Current graph; empty before any project was analyzed. */
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

  /**
   * Analyzes `baseDir` from scratch: resets state, indexes the files, starts watching for changes and records the project as recent.
   * Resolves with the finished graph. Starts duplicate detection in the background without waiting for it.
   */
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
    void documentationIndex.refreshFor(this.getGraph()).catch(() => undefined);
    this.parsingProgressResetTimeout = setTimeout(() => {
      this.parsingProgressResetTimeout = null;
      this.emit('parsing-progress', null);
    }, 2000);

    return this.getGraph();
  }

  /** Clears the previous project's graph and watcher, then records the new base directory and its git churn. */
  private async resetForProject(baseDir: string) {
    const store = oracleStore.getState();
    this.parts.graphRepository.clear();
    store.setBaseDir(baseDir);

    await this.fileWatcher.close();
    this.clearParsingProgressResetTimeout();

    store.setChurnMap(await this.parts.churnAnalyzer.analyze(baseDir));
  }

  /** Parses the project (reusing the on-disk cache for unchanged files), resolves imports, builds the enrichment links and schedules a cache save. */
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

  /** Starts the file watcher; on each change batch it re-resolves imports, rebuilds the affected enrichment links and emits `graph-updated`. */
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

  /** Stops watching, flushes the cache, destroys the worker pool and removes all listeners. Concurrent and repeated calls share one shutdown. */
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
