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
  on: (
    event: WatchEventType,
    listener: (filePath: string) => void | Promise<void>
  ) => ChokidarWatcher;
};

type WatchCallbacks = {
  refreshStackGraphEnrichment: (changedPaths: string[], event: WatchEventType) => Promise<void>;
  emitGraphUpdated: () => void;
};

const WATCHER_REFRESH_DEBOUNCE_MS = 75;

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

    this.watcher = watch(baseDir, {
      ignored: [/(^|[/\\])\../, /node_modules/, /dist/, /dist-electron/, /release/, /build/],
      persistent: true,
      ignoreInitial: true,
    });

    this.watcher
      .on('add', async (filePath: string) => {
        if (shouldIgnorePath(filePath)) return;
        updateLanguageProfile(filePath, 1);
        await this.indexer.reindexFile(filePath, baseDir, getLanguageProfile());
        await this.scheduleRefresh(baseDir, callbacks, [filePath], 'add');
      })
      .on('change', async (filePath: string) => {
        if (shouldIgnorePath(filePath)) return;
        await this.indexer.reindexFile(filePath, baseDir, getLanguageProfile());
        await this.scheduleRefresh(baseDir, callbacks, [filePath], 'change');
      })
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

    try {
      oracleStore.getState().recordWatcherFlush(paths.length, event);
      await callbacks.refreshStackGraphEnrichment(paths, event);
      callbacks.emitGraphUpdated();
      this.cacheManager.saveDebounced(baseDir);
      resolve?.();
    } catch (error) {
      reject?.(error);
    }
  }
}
