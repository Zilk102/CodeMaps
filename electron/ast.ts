import fg from 'fast-glob';
import * as path from 'path';
import * as fs from 'fs/promises';
import * as crypto from 'crypto';
import simpleGit from 'simple-git';
import * as chokidar from 'chokidar';
import { app, BrowserWindow } from 'electron';
import Piscina from 'piscina';

export interface GraphData {
  nodes: { id: string; label: string; group: number; type: string; churn?: number; adr?: string }[];
  links: { source: string; target: string; value: number }[];
  projectRoot: string;
}

const MAX_FILE_SIZE = 300 * 1024; // 300 KB limit per file

let parser: any;
const loadedLanguages = new Map<string, any>();
let isParserInitialized = false;

// Хранилище графа в памяти для инкрементальных обновлений
let currentNodes: Map<string, { id: string; label: string; group: number; type: string; churn: number; adr?: string }> = new Map();
let currentLinks: { source: string; target: string; value: number }[] = [];
let currentBaseDir: string = '';
let currentWatcher: chokidar.FSWatcher | null = null;
let currentChurnMap = new Map<string, number>();

const pool = new Piscina({
  filename: path.join(__dirname, 'worker.js')
});

async function processFile(filePath: string, baseDir: string, isInitial: boolean = false) {
  const normalizedPath = filePath.replace(/\\/g, '/');
  const fileName = path.basename(normalizedPath);
  const churn = currentChurnMap.get(normalizedPath) || 1;
  
  try {
    const result = await pool.run(normalizedPath);
    if (result.sizeExceeded) {
      if (!currentNodes.has(normalizedPath)) {
        currentNodes.set(normalizedPath, { id: normalizedPath, label: fileName, group: 1, type: 'file', churn });
      }
      return;
    }

    const { imports, entities, adr, isMarkdownADR } = result;

    if (isMarkdownADR) {
      currentNodes.set(normalizedPath, { 
        id: normalizedPath, 
        label: `ADR: ${adr}`, 
        group: 4, 
        type: 'adr', 
        churn, 
        adr: normalizedPath 
      });
      return;
    }

    // Обновляем узел файла
    currentNodes.set(normalizedPath, { id: normalizedPath, label: fileName, group: 1, type: 'file', churn, adr });

    // Если в коде есть ссылка на ADR, связываем этот файл с ADR-файлом
    if (adr) {
      // Ищем ADR по имени файла (например "001-auth.md") или пути
      const adrPathMatch = Array.from(currentNodes.keys()).find(p => p.toLowerCase().includes(adr.toLowerCase()) && currentNodes.get(p)?.type === 'adr');
      if (adrPathMatch) {
        currentLinks.push({ source: normalizedPath, target: adrPathMatch, value: 3 }); // Сильная связь с ADR
      }
    }

    // Очищаем старые связи для этого файла (если это инкрементальное обновление)
    if (!isInitial) {
      currentLinks = currentLinks.filter(l => l.source !== normalizedPath);
    }
    
    // Добавляем импорты
    for (const importPath of imports) {
      const dir = path.dirname(normalizedPath);
      const resolvedPath = path.resolve(dir, importPath).replace(/\\/g, '/');
      currentLinks.push({ source: normalizedPath, target: resolvedPath, value: 1 });
    }

    // Добавляем классы и функции
    for (const entity of entities) {
      const id = `${normalizedPath}#${entity.name}`;
      currentNodes.set(id, { 
        id, 
        label: entity.name, 
        group: entity.type === 'class' ? 2 : 3, 
        type: entity.type, 
        churn: 1 
      });
      currentLinks.push({ source: normalizedPath, target: id, value: 2 });
    }
  } catch (e) {
    // Игнорируем ошибки парсинга конкретного файла
  }
}

function getValidGraph(): GraphData {
  // Очистка мертвых линков (импорты, которые не с резолвились в реальные файлы в nodes)
  const validLinks = currentLinks.filter(l => {
    if (l.target.includes('#')) return true;
    
    const exactMatch = currentNodes.has(l.target);
    if (exactMatch) return true;

    const possibleExts = ['.ts', '.tsx', '.js', '.jsx', '/index.ts', '/index.js'];
    for (const ext of possibleExts) {
      const p = l.target + ext;
      if (currentNodes.has(p)) {
        l.target = p; 
        return true;
      }
    }
    return false;
  });

  return {
    projectRoot: currentBaseDir,
    nodes: Array.from(currentNodes.values()),
    links: validLinks
  };
}

export async function analyzeProject(baseDir: string, mainWindow?: BrowserWindow): Promise<GraphData> {
  currentBaseDir = baseDir;
  currentNodes.clear();
  currentLinks = [];
  currentChurnMap.clear();

  if (currentWatcher) {
    await currentWatcher.close();
  }

  const git = simpleGit(baseDir);
  const isRepo = await git.checkIsRepo();
  if (isRepo) {
    try {
      const raw = await git.raw(['log', '--name-only', '--pretty=format:']);
      const lines = raw.split('\n').filter(Boolean);
      lines.forEach(line => {
        const absPath = path.join(baseDir, line).replace(/\\/g, '/');
        currentChurnMap.set(absPath, (currentChurnMap.get(absPath) || 0) + 1);
      });
    } catch (e) {
      console.warn('Git history extraction failed:', e);
    }
  }

  const allFiles = await fg('**/*.{ts,tsx,js,jsx,py,go,rs,java,c,cpp,h,hpp,cs,php,rb,swift,kt,kts,zig,md}', { 
    cwd: baseDir, 
    absolute: true,
    ignore: [
      '**/node_modules/**', '**/dist/**', '**/build/**', '**/.git/**', 
      '**/.idea/**', '**/.vscode/**', '**/venv/**', '**/__pycache__/**', '**/target/**',
      '**/out/**', '**/coverage/**', '**/tmp/**', '**/.*',
      '**/*.lock', '**/pnpm-lock.yaml', '**/yarn.lock', '**/package-lock.json'
    ]
  });

  if (allFiles.length === 0) {
    throw new Error("No source code files found in the selected directory.");
  }

  const cacheDir = path.join(app.getPath('userData'), 'codemaps-cache');
  await fs.mkdir(cacheDir, { recursive: true }).catch(() => {});
  const cacheKey = crypto.createHash('md5').update(baseDir).digest('hex');
  const cacheFile = path.join(cacheDir, `${cacheKey}.json`);

  let cache: any = null;
  try {
    const cacheContent = await fs.readFile(cacheFile, 'utf-8');
    cache = JSON.parse(cacheContent);
    console.log(`Loaded cache for ${baseDir}`);
  } catch (e) {
    console.log(`No cache found for ${baseDir}`);
  }

  // Восстанавливаем кэш
  if (cache && cache.nodes && cache.links && cache.fileStats) {
    cache.nodes.forEach((n: any) => currentNodes.set(n.id, n));
    currentLinks = cache.links;

    // Удаляем из графа файлы, которые были удалены с диска (есть в кэше, но нет в allFiles)
    const allFilesSet = new Set(allFiles.map(f => f.replace(/\\/g, '/')));
    for (const cachedPath of Object.keys(cache.fileStats)) {
      if (!allFilesSet.has(cachedPath)) {
        currentNodes.delete(cachedPath);
        currentLinks = currentLinks.filter(l => l.source !== cachedPath && l.target !== cachedPath);
        for (const [id] of currentNodes) {
          if (id.startsWith(cachedPath + '#')) {
            currentNodes.delete(id);
          }
        }
      }
    }
  }

  // Первичный парсинг только для изменившихся/новых файлов
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

  // Запускаем парсинг параллельно через Worker Pool
  let processed = 0;
  const totalToParse = filesToParse.length;

  if (totalToParse > 0) {
    if (mainWindow) {
      mainWindow.webContents.send('parsing-progress', { status: 'Индексация файлов...', current: 0, total: totalToParse, filename: '' });
    }

    const promises = filesToParse.map(async (filePath) => {
      await processFile(filePath, baseDir, true);
      processed++;
      if (mainWindow && processed % 10 === 0) { // Отправляем прогресс каждые 10 файлов чтобы не перегружать IPC
        mainWindow.webContents.send('parsing-progress', { status: 'Индексация файлов...', current: processed, total: totalToParse, filename: path.basename(filePath) });
      }
    });

    await Promise.all(promises);
    
    if (mainWindow) {
      mainWindow.webContents.send('parsing-progress', { status: 'Индексация завершена', current: totalToParse, total: totalToParse, filename: '' });
      setTimeout(() => mainWindow.webContents.send('parsing-progress', null), 2000);
    }
  }

  // Сохраняем новый кэш на диск асинхронно
  fs.writeFile(cacheFile, JSON.stringify({
    fileStats: newFileStats,
    nodes: Array.from(currentNodes.values()),
    links: currentLinks
  })).catch(e => console.error('Failed to write cache:', e));

  // Настройка chokidar для отслеживания изменений
  currentWatcher = chokidar.watch(baseDir, {
    ignored: [
      /(^|[\/\\])\../, // Игнорируем скрытые файлы и папки
      /node_modules/,
      /dist/,
      /build/
    ],
    persistent: true,
    ignoreInitial: true
  });

  const saveCacheDebounced = () => {
    const stats: Record<string, number> = {};
    for (const [id, node] of currentNodes) {
      if (node.type === 'file') {
        fs.stat(id).then(s => stats[id] = s.mtimeMs).catch(() => {});
      }
    }
    // Записываем кэш с небольшой задержкой, чтобы не спамить диск при массовых изменениях
    setTimeout(() => {
      fs.writeFile(cacheFile, JSON.stringify({
        fileStats: stats,
        nodes: Array.from(currentNodes.values()),
        links: currentLinks
      })).catch(() => {});
    }, 1000);
  };

  currentWatcher
    .on('add', async (filePath: string) => {
      if (filePath.includes('node_modules') || filePath.includes('.git')) return;
      await processFile(filePath, baseDir, false);
      if (mainWindow) mainWindow.webContents.send('graph-updated', getValidGraph());
      saveCacheDebounced();
    })
    .on('change', async (filePath: string) => {
      if (filePath.includes('node_modules') || filePath.includes('.git')) return;
      await processFile(filePath, baseDir, false);
      if (mainWindow) mainWindow.webContents.send('graph-updated', getValidGraph());
      saveCacheDebounced();
    })
    .on('unlink', (filePath: string) => {
      const normalizedPath = filePath.replace(/\\/g, '/');
      currentNodes.delete(normalizedPath);
      currentLinks = currentLinks.filter(l => l.source !== normalizedPath && l.target !== normalizedPath);
      
      // Удаляем связанные узлы (функции/классы)
      for (const [id] of currentNodes) {
        if (id.startsWith(normalizedPath + '#')) {
          currentNodes.delete(id);
        }
      }

      if (mainWindow) mainWindow.webContents.send('graph-updated', getValidGraph());
      saveCacheDebounced();
    });

  return getValidGraph();
}