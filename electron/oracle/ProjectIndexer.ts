import fg from 'fast-glob';
import * as fs from 'fs/promises';
import * as path from 'path';
import Piscina from 'piscina';
import { detectProjectLanguages } from '../parsing/projectLanguageDetector';
import { ProjectLanguageProfile } from '../parsing/types';
import { oracleStore } from '../store';
import { ProjectCacheSnapshot } from './CacheManager';
import { GraphBuilder } from './GraphBuilder';
import { ORACLE_IGNORE_GLOBS, normalizePath } from './shared';

export interface IndexProjectResult {
  filePaths: string[];
  fileStats: Record<string, number>;
  languageProfile: ProjectLanguageProfile;
}

export class ProjectIndexer {
  constructor(
    private readonly pool: Piscina,
    private readonly graphBuilder: GraphBuilder
  ) {}

  async discoverFiles(baseDir: string) {
    return fg('**/*', {
      cwd: baseDir,
      absolute: true,
      ignore: ORACLE_IGNORE_GLOBS,
    });
  }

  createLanguageProfile(filePaths: string[]) {
    return detectProjectLanguages(filePaths.map((filePath) => normalizePath(filePath)));
  }

  async reindexFile(filePath: string, baseDir: string, languageProfile: ProjectLanguageProfile, retryCount = 0): Promise<void> {
    const normalizedPath = normalizePath(filePath);
    const churn = oracleStore.getState().churnMap.get(normalizedPath) || 1;
    
    try {
      const result = await this.pool.run({
        filePath: normalizedPath,
        activeLanguageIds: languageProfile.activeLanguageIds,
        baseDir,
      });

      // Always clear the previous file-level graph artifacts before applying a fresh parse.
      // This prevents stale symbol nodes and import links from surviving cache restore + reindex.
      this.graphBuilder.removeFileArtifacts(normalizedPath);
      this.graphBuilder.applyParsedFile(normalizedPath, baseDir, churn, result);
    } catch (error) {
      if (retryCount < 2) {
        console.warn(`[ProjectIndexer] Retrying parse for ${filePath} (attempt ${retryCount + 1})`, error);
        await new Promise(resolve => setTimeout(resolve, 500 * Math.pow(2, retryCount)));
        return this.reindexFile(filePath, baseDir, languageProfile, retryCount + 1);
      }
      console.error(`[ProjectIndexer] Failed to parse ${filePath} after ${retryCount} retries`, error);
      // Optional: Add empty file node to prevent graph break
      this.graphBuilder.removeFileArtifacts(normalizedPath);
    }
  }

  async indexProject(
    baseDir: string,
    cache: ProjectCacheSnapshot | null,
    onProgress?: (progress: {
      status: string;
      current: number;
      total: number;
      filename: string;
    }) => void
  ): Promise<IndexProjectResult> {
    const filePaths = (await this.discoverFiles(baseDir)).map((filePath) =>
      normalizePath(filePath)
    );
    if (filePaths.length === 0) {
      throw new Error('No source code files found in the selected directory.');
    }

    const languageProfile = this.createLanguageProfile(filePaths);

    if (cache?.nodes && cache.links && cache.fileStats) {
      const store = oracleStore.getState();
      store.restoreCache(cache.nodes, cache.links);

      const allFilesSet = new Set(filePaths);
      Object.keys(cache.fileStats).forEach((cachedPath) => {
        if (!allFilesSet.has(cachedPath)) {
          this.graphBuilder.removeFile(cachedPath);
        }
      });
    }

    const state = oracleStore.getState();
    for (const [nodeId, node] of state.nodes) {
      if (node.type === 'directory') {
        state.removeNode(nodeId);
      }
    }

    filePaths.forEach((filePath) =>
      this.graphBuilder.ensureDirectoryChainForFile(filePath, baseDir)
    );

    const fileStats: Record<string, number> = {};
    const filesToParse: string[] = [];

    for (const filePath of filePaths) {
      const fileStat = await fs.stat(filePath);
      fileStats[filePath] = fileStat.mtimeMs;
      if (cache?.fileStats?.[filePath] !== fileStat.mtimeMs) {
        filesToParse.push(filePath);
      }
    }

    const totalToParse = filesToParse.length;
    let processed = 0;

    if (totalToParse > 0 && onProgress) {
      onProgress({ status: 'indexing_files', current: 0, total: totalToParse, filename: '' });
    }

    await Promise.all(
      filesToParse.map(async (filePath) => {
        await this.reindexFile(filePath, baseDir, languageProfile);
        processed += 1;
        if (onProgress && processed % 10 === 0) {
          onProgress({
            status: 'indexing_files',
            current: processed,
            total: totalToParse,
            filename: path.basename(filePath),
          });
        }
      })
    );

    if (onProgress && totalToParse > 0) {
      onProgress({
        status: 'indexing_complete',
        current: totalToParse,
        total: totalToParse,
        filename: '',
      });
    }

    return {
      filePaths,
      fileStats,
      languageProfile,
    };
  }
}
