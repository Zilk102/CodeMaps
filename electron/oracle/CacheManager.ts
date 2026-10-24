/** On-disk cache of an analyzed project (nodes, links and file modification times) so unchanged files are not parsed again. */

import log from 'electron-log/main';
import * as crypto from 'crypto';
import * as fs from 'fs/promises';
import * as os from 'os';
import * as path from 'path';
import { app } from 'electron';
import pLimit from 'p-limit';
import { GraphLink, GraphNode, oracleStore } from '../store';
import { getOraclePerformanceConfig, OraclePerformanceConfig } from './performanceConfig';
import { ORACLE_CACHE_VERSION } from './shared';

/** What is stored per project: the graph plus the modification time of every file at save time, used to decide which files need re-parsing. */
export interface ProjectCacheSnapshot {
  fileStats: Record<string, number>;
  nodes: GraphNode[];
  links: GraphLink[];
}

/** Reads and writes one cache file per project, named from a hash of the project path and the cache format version (so a version bump discards old caches). */
export class CacheManager {
  private saveTimeout: ReturnType<typeof setTimeout> | null = null;
  private readonly performanceConfig: OraclePerformanceConfig;

  constructor(performanceConfig: OraclePerformanceConfig = getOraclePerformanceConfig()) {
    this.performanceConfig = performanceConfig;
  }

  /** Cache folder inside Electron's userData, or a per-user fallback when Electron is unavailable (tests, plain Node). */
  private getCacheDir() {
    try {
      if (typeof app?.getPath === 'function') {
        return path.join(app.getPath('userData'), 'codemaps-cache');
      }
    } catch {
      // Fall back to a user-scoped cache directory when Electron app context is unavailable.
    }

    const fallbackRoot =
      process.env.LOCALAPPDATA || process.env.APPDATA || path.join(os.homedir(), '.codemaps');

    return path.join(fallbackRoot, 'CodeMaps', 'cache');
  }

  private getCacheFile(baseDir: string) {
    const cacheDir = this.getCacheDir();
    const cacheKey = crypto.createHash('md5').update(baseDir).digest('hex');
    return {
      cacheDir,
      cacheFile: path.join(cacheDir, `${cacheKey}_v${ORACLE_CACHE_VERSION}.json`),
    };
  }

  /** Returns the cache stored for `baseDir`, or null when it is missing or unreadable. */
  async load(baseDir: string): Promise<ProjectCacheSnapshot | null> {
    const { cacheFile } = this.getCacheFile(baseDir);
    try {
      const cacheContent = await fs.readFile(cacheFile, 'utf-8');
      return JSON.parse(cacheContent) as ProjectCacheSnapshot;
    } catch {
      return null;
    }
  }

  /** Writes the current store contents as the cache of `baseDir`. Files that vanished since indexing are left out of `fileStats`, so they get re-checked next time. Throws on write errors. */
  async save(baseDir: string) {
    const { cacheDir, cacheFile } = this.getCacheFile(baseDir);
    const state = oracleStore.getState();
    const stats: Record<string, number> = {};
    const statLimit = pLimit(this.performanceConfig.cache.statConcurrency);

    await Promise.all(
      Array.from(state.nodes.entries()).map(([id, node]) =>
        statLimit(async () => {
          if (node.type !== 'file') return;
          try {
            const fileStat = await fs.stat(id);
            stats[id] = fileStat.mtimeMs;
          } catch {
            // Ignore deleted files between indexing and cache flush.
          }
        })
      )
    );

    await fs.mkdir(cacheDir, { recursive: true }).catch(() => undefined);
    await fs.writeFile(
      cacheFile,
      JSON.stringify({
        fileStats: stats,
        nodes: Array.from(state.nodes.values()),
        links: state.links,
      })
    );
  }

  /** Schedules `save` one second from now, restarting the timer on every call so a burst of changes writes once. Write errors are logged. */
  saveDebounced(baseDir: string) {
    if (this.saveTimeout) {
      clearTimeout(this.saveTimeout);
    }

    this.saveTimeout = setTimeout(async () => {
      this.saveTimeout = null;
      try {
        await this.save(baseDir);
      } catch (error) {
        log.error('Failed to write cache:', error);
      }
    }, 1000);
  }

  /** Cancels a pending debounced save and, when `baseDir` is given, saves immediately so the latest state survives shutdown. Errors are logged, not thrown. */
  async close(baseDir?: string) {
    if (this.saveTimeout) {
      clearTimeout(this.saveTimeout);
      this.saveTimeout = null;
    }

    if (!baseDir) {
      return;
    }

    try {
      await this.save(baseDir);
    } catch (error) {
      log.error('Failed to flush cache on shutdown:', error);
    }
  }
}
