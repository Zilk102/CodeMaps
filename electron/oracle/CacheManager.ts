import log from 'electron-log/main';
import * as crypto from 'crypto';
import * as fs from 'fs/promises';
import * as os from 'os';
import * as path from 'path';
import { app } from 'electron';
import { GraphLink, GraphNode, oracleStore } from '../store';
import { ORACLE_CACHE_VERSION } from './shared';

export interface ProjectCacheSnapshot {
  fileStats: Record<string, number>;
  nodes: GraphNode[];
  links: GraphLink[];
}

export class CacheManager {
  private saveTimeout: ReturnType<typeof setTimeout> | null = null;

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

  async load(baseDir: string): Promise<ProjectCacheSnapshot | null> {
    const { cacheFile } = this.getCacheFile(baseDir);
    try {
      const cacheContent = await fs.readFile(cacheFile, 'utf-8');
      return JSON.parse(cacheContent) as ProjectCacheSnapshot;
    } catch {
      return null;
    }
  }

  async save(baseDir: string) {
    const { cacheDir, cacheFile } = this.getCacheFile(baseDir);
    const state = oracleStore.getState();
    const stats: Record<string, number> = {};

    for (const [id, node] of state.nodes) {
      if (node.type !== 'file') continue;
      try {
        const fileStat = await fs.stat(id);
        stats[id] = fileStat.mtimeMs;
      } catch {
        // Ignore deleted files between indexing and cache flush.
      }
    }

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

  saveDebounced(baseDir: string) {
    if (this.saveTimeout) {
      clearTimeout(this.saveTimeout);
    }

    this.saveTimeout = setTimeout(async () => {
      try {
        await this.save(baseDir);
      } catch (error) {
        log.error('Failed to write cache:', error);
      }
    }, 1000);
  }
}
