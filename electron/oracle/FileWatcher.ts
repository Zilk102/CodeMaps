import * as path from 'path';
import { ProjectLanguageProfile } from '../parsing/types';
import { oracleStore } from '../store';
import { CacheManager } from './CacheManager';
import { GraphBuilder } from './GraphBuilder';
import { ProjectIndexer } from './ProjectIndexer';
import { normalizePath, shouldIgnorePath } from './shared';

type WatchEventType = 'add' | 'change' | 'unlink' | 'addDir' | 'unlinkDir';
type ChokidarWatcher = {
  close: () => Promise<void>;
  on: {
    (event: WatchEventType, listener: (filePath: string) => void | Promise<void>): ChokidarWatcher;
    (event: 'ready', listener: () => void): ChokidarWatcher;
    (event: 'error', listener: (error: unknown) => void): ChokidarWatcher;
  };
};

type WatchCallbacks = {
  refreshStackGraphEnrichment: (changedPaths: string[], event: WatchEventType) => Promise<void>;
  emitGraphUpdated: () => void;
};

const WATCHER_REFRESH_DEBOUNCE_MS = 75;
const WATCHER_IDLE_GRACE_MS = 300;
// A huge tree must not block opening a project forever.
const WATCHER_READY_TIMEOUT_MS = 15_000;
const MAX_IDLE_ROUNDS = 20;

const WATCH_EVENT_PRIORITY: Record<WatchEventType, number> = {
  change: 1,
  add: 2,
  unlink: 3,
  addDir: 4,
  unlinkDir: 5,
};

export class FileWatcher {
  private watcher: ChokidarWatcher | null = null;
  private refreshTimeout: ReturnType<typeof setTimeout> | null = null;
  private pendingRefreshPaths = new Set<string>();
  private pendingRefreshEvent: WatchEventType = 'change';
  private pendingRefreshPromise: Promise<void> | null = null;
  private pendingRefreshResolve: (() => void) | null = null;
  private pendingRefreshReject: ((error: unknown) => void) | null = null;
  private flushInFlight: Promise<void> | null = null;
  private readonly handlersInFlight = new Set<Promise<unknown>>();

  constructor(
    private readonly indexer: ProjectIndexer,
    private readonly graphBuilder: GraphBuilder,
    private readonly cacheManager: CacheManager
  ) {}

  async close() {
    if (this.refreshTimeout) {
      clearTimeout(this.refreshTimeout);
      this.refreshTimeout = null;
    }
    this.pendingRefreshPaths.clear();
    this.pendingRefreshEvent = 'change';
    this.pendingRefreshResolve?.();
    this.pendingRefreshResolve = null;
    this.pendingRefreshReject = null;
    this.pendingRefreshPromise = null;

    if (this.watcher) {
      await this.watcher.close();
      this.watcher = null;
    }
  }

  async start(
    baseDir: string,
    getLanguageProfile: () => ProjectLanguageProfile,
    updateLanguageProfile: (filePath: string, delta: 1 | -1) => void,
    callbacks: WatchCallbacks
  ) {
    await this.close();
    const { watch } = await import('chokidar');

    const watcher: ChokidarWatcher = watch(baseDir, {
      ignored: [/(^|[/\\])\../, /node_modules/, /dist/, /dist-electron/, /release/, /build/],
      persistent: true,
      ignoreInitial: true,
    });
    this.watcher = watcher;

    // Files saved before the initial scan finishes are never reported, so analysis must not be
    // considered done (and agents must not start editing) until the watcher is live.
    const ready = new Promise<void>((resolve) => {
      const timer = setTimeout(resolve, WATCHER_READY_TIMEOUT_MS);
      watcher.on('ready', () => {
        clearTimeout(timer);
        resolve();
      });
    });
    watcher.on('error', (error: unknown) => console.warn('[FileWatcher] watcher error:', error));

    watcher
      .on('add', (filePath: string) =>
        this.track(async () => {
          if (shouldIgnorePath(filePath)) return;
          updateLanguageProfile(filePath, 1);
          await this.indexer.reindexFile(filePath, baseDir, getLanguageProfile());
          await this.scheduleRefresh(baseDir, callbacks, [filePath], 'add');
        })
      )
      .on('change', (filePath: string) =>
        this.track(async () => {
          if (shouldIgnorePath(filePath)) return;
          await this.indexer.reindexFile(filePath, baseDir, getLanguageProfile());
          await this.scheduleRefresh(baseDir, callbacks, [filePath], 'change');
        })
      )
      .on('unlink', async (filePath: string) => {
        const normalizedPath = normalizePath(filePath);
        updateLanguageProfile(normalizedPath, -1);
        this.graphBuilder.removeFile(normalizedPath);
        await this.scheduleRefresh(baseDir, callbacks, [normalizedPath], 'unlink');
      })
      .on('addDir', async (dirPath: string) => {
        if (shouldIgnorePath(dirPath)) return;
        const placeholder = normalizePath(path.join(dirPath, '__placeholder__.ts'));
        this.graphBuilder.ensureDirectoryChainForFile(placeholder, baseDir);
        await this.scheduleRefresh(baseDir, callbacks, [normalizePath(dirPath)], 'addDir');
      })
      .on('unlinkDir', async (dirPath: string) => {
        this.graphBuilder.removeDirectory(normalizePath(dirPath));
        await this.scheduleRefresh(baseDir, callbacks, [normalizePath(dirPath)], 'unlinkDir');
      });

    await ready;
  }

  private scheduleRefresh(
    baseDir: string,
    callbacks: WatchCallbacks,
    changedPaths: string[],
    event: WatchEventType
  ) {
    for (const changedPath of changedPaths) {
      this.pendingRefreshPaths.add(normalizePath(changedPath));
    }

    if (WATCH_EVENT_PRIORITY[event] > WATCH_EVENT_PRIORITY[this.pendingRefreshEvent]) {
      this.pendingRefreshEvent = event;
    }

    if (!this.pendingRefreshPromise) {
      this.pendingRefreshPromise = new Promise<void>((resolve, reject) => {
        this.pendingRefreshResolve = resolve;
        this.pendingRefreshReject = reject;
      });
    }

    if (this.refreshTimeout) {
      clearTimeout(this.refreshTimeout);
    }

    this.refreshTimeout = setTimeout(() => {
      void this.flushRefresh(baseDir, callbacks);
    }, WATCHER_REFRESH_DEBOUNCE_MS);

    return this.pendingRefreshPromise;
  }

  private async flushRefresh(baseDir: string, callbacks: WatchCallbacks) {
    const paths = Array.from(this.pendingRefreshPaths);
    const event = this.pendingRefreshEvent;
    const resolve = this.pendingRefreshResolve;
    const reject = this.pendingRefreshReject;

    this.pendingRefreshPaths.clear();
    this.pendingRefreshEvent = 'change';
    this.refreshTimeout = null;
    this.pendingRefreshResolve = null;
    this.pendingRefreshReject = null;
    this.pendingRefreshPromise = null;

    const work = (async () => {
      try {
        oracleStore.getState().recordWatcherFlush(paths.length, event);
        await callbacks.refreshStackGraphEnrichment(paths, event);
        callbacks.emitGraphUpdated();
        this.cacheManager.saveDebounced(baseDir);
        resolve?.();
      } catch (error) {
        reject?.(error);
      }
    })();
    this.flushInFlight = work;
    await work;
    if (this.flushInFlight === work) {
      this.flushInFlight = null;
    }
  }

  /** Remembers a file-event handler (parse + schedule) so whenIdle can wait for it. */
  private track<T>(work: () => Promise<T>): Promise<T> {
    const running = work();
    this.handlersInFlight.add(running);
    const forget = () => this.handlersInFlight.delete(running);
    running.then(forget, forget);
    return running;
  }

  /**
   * Resolves once the graph reflects every file change seen so far: both a refresh that is
   * still waiting out its debounce and one already running. Lets a caller that just saved a
   * file (an agent, a hook) read the graph without racing the indexer.
   */
  async whenIdle(graceMs = WATCHER_IDLE_GRACE_MS) {
    // A save may not have produced its watcher event yet.
    await new Promise((resolve) => setTimeout(resolve, graceMs));
    for (let round = 0; round < MAX_IDLE_ROUNDS; round += 1) {
      const handlers = Array.from(this.handlersInFlight);
      if (handlers.length > 0) {
        await Promise.allSettled(handlers);
        continue;
      }
      const pending = this.pendingRefreshPromise ?? this.flushInFlight;
      if (!pending) return;
      await pending.catch(() => undefined);
    }
  }
}
