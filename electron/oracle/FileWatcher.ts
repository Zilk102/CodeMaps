import * as chokidar from 'chokidar';
import * as path from 'path';
import { ProjectLanguageProfile } from '../parsing/types';
import { CacheManager } from './CacheManager';
import { GraphBuilder } from './GraphBuilder';
import { GraphRepository } from './GraphRepository';
import { ProjectIndexer } from './ProjectIndexer';
import { normalizePath, shouldIgnorePath } from './shared';

type WatchCallbacks = {
  emitGraphUpdated: () => void;
};

export class FileWatcher {
  private watcher: chokidar.FSWatcher | null = null;

  constructor(
    private readonly indexer: ProjectIndexer,
    private readonly graphBuilder: GraphBuilder,
    private readonly graphRepository: GraphRepository,
    private readonly cacheManager: CacheManager
  ) {}

  async close() {
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

    this.watcher = chokidar.watch(baseDir, {
      ignored: [
        /(^|[\/\\])\../,
        /node_modules/,
        /dist/,
        /dist-electron/,
        /release/,
        /build/
      ],
      persistent: true,
      ignoreInitial: true
    });

    this.watcher
      .on('add', async (filePath: string) => {
        if (shouldIgnorePath(filePath)) return;
        updateLanguageProfile(filePath, 1);
        await this.indexer.reindexFile(filePath, baseDir, getLanguageProfile());
        callbacks.emitGraphUpdated();
        this.cacheManager.saveDebounced(baseDir);
      })
      .on('change', async (filePath: string) => {
        if (shouldIgnorePath(filePath)) return;
        await this.indexer.reindexFile(filePath, baseDir, getLanguageProfile());
        callbacks.emitGraphUpdated();
        this.cacheManager.saveDebounced(baseDir);
      })
      .on('unlink', (filePath: string) => {
        const normalizedPath = normalizePath(filePath);
        updateLanguageProfile(normalizedPath, -1);
        this.graphBuilder.removeFile(normalizedPath);
        callbacks.emitGraphUpdated();
        this.cacheManager.saveDebounced(baseDir);
      })
      .on('addDir', (dirPath: string) => {
        if (shouldIgnorePath(dirPath)) return;
        const placeholder = normalizePath(path.join(dirPath, '__placeholder__.ts'));
        this.graphBuilder.ensureDirectoryChainForFile(placeholder, baseDir);
        callbacks.emitGraphUpdated();
        this.cacheManager.saveDebounced(baseDir);
      })
      .on('unlinkDir', (dirPath: string) => {
        this.graphBuilder.removeDirectory(normalizePath(dirPath));
        callbacks.emitGraphUpdated();
        this.cacheManager.saveDebounced(baseDir);
      });
  }
}
