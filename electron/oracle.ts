import { EventEmitter } from 'events';
import fg from 'fast-glob';
import * as path from 'path';
import * as fs from 'fs/promises';
import * as crypto from 'crypto';
import simpleGit from 'simple-git';
import * as chokidar from 'chokidar';
import { app } from 'electron';
import Piscina from 'piscina';
import { oracleStore } from './store';
import { getLanguageByExtension } from './parsing/languageRegistry';
import { detectProjectLanguages } from './parsing/projectLanguageDetector';
import { ProjectLanguageProfile } from './parsing/types';

export class OracleService extends EventEmitter {
  private watcher: chokidar.FSWatcher | null = null;
  private pool: Piscina;
  private saveCacheTimeout: NodeJS.Timeout | null = null;
  private projectLanguageProfile: ProjectLanguageProfile = {
    activeLanguageIds: [],
    languageFileCounts: {},
  };

  constructor() {
    super();
    this.pool = new Piscina({
      filename: path.join(__dirname, 'worker.js')
    });
  }

  private setProjectLanguageProfile(filePaths: string[]) {
    this.projectLanguageProfile = detectProjectLanguages(filePaths);
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

  private ensureDirectoryChainForFile(filePath: string, baseDir: string) {
    const store = oracleStore.getState();
    const normalizedBaseDir = baseDir.replace(/\\/g, '/');
    let currentDir = path.dirname(filePath).replace(/\\/g, '/');

    while (
      currentDir.startsWith(normalizedBaseDir) &&
      currentDir !== normalizedBaseDir &&
      currentDir !== '.' &&
      currentDir !== path.dirname(currentDir).replace(/\\/g, '/')
    ) {
      const parentDir = path.dirname(currentDir).replace(/\\/g, '/');
      const hasParent = parentDir.startsWith(normalizedBaseDir) && parentDir !== normalizedBaseDir;

      if (!store.nodes.has(currentDir)) {
        store.upsertNode({
          id: currentDir,
          label: path.basename(currentDir),
          group: 0,
          type: 'directory',
          churn: 0,
          parentId: hasParent ? parentDir : undefined
        });
      }

      currentDir = parentDir;
    }
  }

  private async processFile(filePath: string, baseDir: string, isInitial: boolean = false) {
    const store = oracleStore.getState();
    const normalizedPath = filePath.replace(/\\/g, '/');
    const fileName = path.basename(normalizedPath);
    const churn = store.churnMap.get(normalizedPath) || 1;
    
    try {
      const result = await this.pool.run({
        filePath: normalizedPath,
        activeLanguageIds: this.projectLanguageProfile.activeLanguageIds,
      });

      if (!isInitial) {
        store.removeLinksBySource(normalizedPath);
        store.removeNodesPrefix(normalizedPath + '#');
      }

      this.ensureDirectoryChainForFile(normalizedPath, baseDir);
      const parentDir = path.dirname(normalizedPath).replace(/\\/g, '/');
      const normalizedBaseDir = baseDir.replace(/\\/g, '/');
      const hasParent = parentDir.startsWith(normalizedBaseDir) && parentDir !== normalizedBaseDir;

      if (result.sizeExceeded) {
        if (!store.nodes.has(normalizedPath)) {
          store.upsertNode({ 
            id: normalizedPath, 
            label: fileName, 
            group: 1, 
            type: 'file', 
            churn,
            parentId: hasParent ? parentDir : undefined
          });
        }
        return;
      }

      const { imports, entities, adr, isMarkdownADR } = result;

      if (isMarkdownADR) {
        store.upsertNode({ 
          id: normalizedPath, 
          label: `ADR: ${adr}`, 
          group: 4, 
          type: 'adr', 
          churn, 
          adr: normalizedPath,
          parentId: hasParent ? parentDir : undefined
        });
        return;
      }

      store.upsertNode({ 
        id: normalizedPath, 
        label: fileName, 
        group: 1, 
        type: 'file', 
        churn, 
        adr,
        parentId: hasParent ? parentDir : undefined
      });

      if (adr) {
        const adrPathMatch = Array.from(store.nodes.keys()).find(p => p.toLowerCase().includes(adr.toLowerCase()) && store.nodes.get(p)?.type === 'adr');
        if (adrPathMatch) {
          store.addLink({ source: normalizedPath, target: adrPathMatch, value: 3, type: 'adr' });
        }
      }

      for (const imp of imports) {
        const dir = path.dirname(normalizedPath);
        const resolvedPath = path.resolve(dir, imp.path).replace(/\\/g, '/');
        
        if (imp.importedEntities && imp.importedEntities.length > 0) {
          for (const entityName of imp.importedEntities) {
            store.addLink({ 
              source: normalizedPath, 
              target: `${resolvedPath}#${entityName}`, 
              value: 2, 
              type: 'import' 
            });
          }
        } else {
          store.addLink({ source: normalizedPath, target: resolvedPath, value: 1, type: 'import' });
        }
      }

      for (const entity of entities) {
        const id = `${normalizedPath}#${entity.name}`;
        store.upsertNode({ 
          id, 
          label: entity.name, 
          group: entity.type === 'class' ? 2 : 3, 
          type: entity.type, 
          churn, // Унаследованная метрика от файла
          parentId: normalizedPath
        });
      }
    } catch (e) {
      // Игнорируем ошибки парсинга конкретного файла
    }
  }

  private saveCacheDebounced() {
    if (this.saveCacheTimeout) {
      clearTimeout(this.saveCacheTimeout);
    }
    this.saveCacheTimeout = setTimeout(async () => {
      try {
        const store = oracleStore.getState();
        const baseDir = store.baseDir;
        if (!baseDir) return;

        const cacheDir = path.join(app.getPath('userData'), 'codemaps-cache');
        const cacheKey = crypto.createHash('md5').update(baseDir).digest('hex');
        const cacheFile = path.join(cacheDir, `${cacheKey}_v5.json`);

        const stats: Record<string, number> = {};
        for (const [id, node] of store.nodes) {
          if (node.type === 'file') {
            try {
              const s = await fs.stat(id);
              stats[id] = s.mtimeMs;
            } catch (e) {}
          }
        }

        await fs.writeFile(cacheFile, JSON.stringify({
          fileStats: stats,
          nodes: Array.from(store.nodes.values()),
          links: store.links
        }));
      } catch (e) {
        console.error('Failed to write cache:', e);
      }
    }, 1000);
  }

  public async analyzeProject(baseDir: string) {
    const store = oracleStore.getState();
    store.clear();
    store.setBaseDir(baseDir);

    if (this.watcher) {
      await this.watcher.close();
    }

    const git = simpleGit(baseDir);
    const isRepo = await git.checkIsRepo();
    const newChurnMap = new Map<string, number>();
    
    if (isRepo) {
      try {
        const raw = await git.raw(['log', '--name-only', '--pretty=format:']);
        const lines = raw.split('\n').filter(Boolean);
        lines.forEach(line => {
          const absPath = path.join(baseDir, line).replace(/\\/g, '/');
          newChurnMap.set(absPath, (newChurnMap.get(absPath) || 0) + 1);
        });
      } catch (e) {
        console.warn('Git history extraction failed:', e);
      }
    }
    store.setChurnMap(newChurnMap);

    const allFiles = await fg('**/*', { 
      cwd: baseDir, 
      absolute: true,
      ignore: [
        '**/node_modules/**', '**/dist/**', '**/build/**', '**/.git/**', 
        '**/.idea/**', '**/.vscode/**', '**/venv/**', '**/__pycache__/**', '**/target/**',
        '**/out/**', '**/coverage/**', '**/tmp/**', '**/.*',
        '**/*.lock', '**/pnpm-lock.yaml', '**/yarn.lock', '**/package-lock.json',
        '**/*.png', '**/*.jpg', '**/*.jpeg', '**/*.gif', '**/*.svg', '**/*.ico', '**/*.webp',
        '**/*.mp4', '**/*.webm', '**/*.ogg', '**/*.mp3', '**/*.wav',
        '**/*.pdf', '**/*.zip', '**/*.tar', '**/*.gz', '**/*.rar', '**/*.7z',
        '**/*.woff', '**/*.woff2', '**/*.ttf', '**/*.eot',
        '**/*.exe', '**/*.dll', '**/*.so', '**/*.dylib', '**/*.bin', '**/*.pyc', '**/*.class'
      ]
    });

    if (allFiles.length === 0) {
      throw new Error("No source code files found in the selected directory.");
    }

    this.setProjectLanguageProfile(allFiles.map((filePath) => filePath.replace(/\\/g, '/')));

    const cacheDir = path.join(app.getPath('userData'), 'codemaps-cache');
    await fs.mkdir(cacheDir, { recursive: true }).catch(() => {});
    const cacheKey = crypto.createHash('md5').update(baseDir).digest('hex');
    const cacheFile = path.join(cacheDir, `${cacheKey}_v5.json`);

    let cache: any = null;
    try {
      const cacheContent = await fs.readFile(cacheFile, 'utf-8');
      cache = JSON.parse(cacheContent);
      console.log(`Loaded cache for ${baseDir}`);
    } catch (e) {
      console.log(`No cache found for ${baseDir}`);
    }

    if (cache && cache.nodes && cache.links && cache.fileStats) {
      store.restoreCache(cache.nodes, cache.links);

      const allFilesSet = new Set(allFiles.map(f => f.replace(/\\/g, '/')));
      for (const cachedPath of Object.keys(cache.fileStats)) {
        if (!allFilesSet.has(cachedPath)) {
          store.removeNode(cachedPath);
          store.removeLinksBySourceOrTarget(cachedPath);
          store.removeNodesPrefix(cachedPath + '#');
        }
      }
    }

    const currentStoreState = oracleStore.getState();
    for (const [id, node] of currentStoreState.nodes) {
      if (node.type === 'directory') {
        store.removeNode(id);
      }
    }
    allFiles.forEach(filePath => this.ensureDirectoryChainForFile(filePath.replace(/\\/g, '/'), baseDir));

    const newFileStats: Record<string, number> = {};
    const filesToParse: string[] = [];

    for (const filePath of allFiles) {
      const normalizedPath = filePath.replace(/\\/g, '/');
      const stat = await fs.stat(normalizedPath);
      newFileStats[normalizedPath] = stat.mtimeMs;

      const cachedMtime = cache?.fileStats?.[normalizedPath];
      if (cachedMtime !== stat.mtimeMs) {
        filesToParse.push(normalizedPath);
      }
    }

    let processed = 0;
    const totalToParse = filesToParse.length;

    if (totalToParse > 0) {
      this.emit('parsing-progress', { status: 'Индексация файлов...', current: 0, total: totalToParse, filename: '' });

      const promises = filesToParse.map(async (filePath) => {
        await this.processFile(filePath, baseDir, true);
        processed++;
        if (processed % 10 === 0) {
          this.emit('parsing-progress', { status: 'Индексация файлов...', current: processed, total: totalToParse, filename: path.basename(filePath) });
        }
      });

      await Promise.all(promises);
      
      this.emit('parsing-progress', { status: 'Индексация завершена', current: totalToParse, total: totalToParse, filename: '' });
      setTimeout(() => this.emit('parsing-progress', null), 2000);
    }

    this.saveCacheDebounced();

    this.watcher = chokidar.watch(baseDir, {
      ignored: [
        /(^|[\/\\])\../,
        /node_modules/,
        /dist/,
        /build/
      ],
      persistent: true,
      ignoreInitial: true
    });

    this.watcher
      .on('add', async (filePath: string) => {
        if (filePath.includes('node_modules') || filePath.includes('.git')) return;
        this.updateLanguageCount(filePath, 1);
        await this.processFile(filePath, baseDir, false);
        this.emit('graph-updated', oracleStore.getState().getValidGraph());
        this.saveCacheDebounced();
      })
      .on('change', async (filePath: string) => {
        if (filePath.includes('node_modules') || filePath.includes('.git')) return;
        await this.processFile(filePath, baseDir, false);
        this.emit('graph-updated', oracleStore.getState().getValidGraph());
        this.saveCacheDebounced();
      })
      .on('unlink', (filePath: string) => {
        const normalizedPath = filePath.replace(/\\/g, '/');
        this.updateLanguageCount(normalizedPath, -1);
        const currentStore = oracleStore.getState();
        currentStore.removeNode(normalizedPath);
        currentStore.removeLinksBySourceOrTarget(normalizedPath);
        currentStore.removeNodesPrefix(normalizedPath + '#');

        this.emit('graph-updated', currentStore.getValidGraph());
        this.saveCacheDebounced();
      })
      .on('addDir', (dirPath: string) => {
        if (dirPath.includes('node_modules') || dirPath.includes('.git')) return;
        this.ensureDirectoryChainForFile(path.join(dirPath, '__placeholder__.ts').replace(/\\/g, '/'), baseDir);
        oracleStore.getState().removeLinksBySource(path.join(dirPath, '__placeholder__.ts').replace(/\\/g, '/'));
        this.emit('graph-updated', oracleStore.getState().getValidGraph());
        this.saveCacheDebounced();
      })
      .on('unlinkDir', (dirPath: string) => {
        const normalizedDir = dirPath.replace(/\\/g, '/');
        const currentStore = oracleStore.getState();
        currentStore.removeNode(normalizedDir);
        currentStore.removeLinksBySourceOrTarget(normalizedDir);
        this.emit('graph-updated', currentStore.getValidGraph());
        this.saveCacheDebounced();
      });

    return oracleStore.getState().getValidGraph();
  }
}

export const oracle = new OracleService();
