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
  links: { source: string; target: string; value: number; type?: string }[];
  projectRoot: string;
}

const MAX_FILE_SIZE = 300 * 1024; // 300 KB limit per file

let parser: any;
const loadedLanguages = new Map<string, any>();
let isParserInitialized = false;

// Хранилище графа в памяти для инкрементальных обновлений
let currentNodes: Map<string, { id: string; label: string; group: number; type: string; churn: number; adr?: string }> = new Map();
let currentLinks: { source: string; target: string; value: number; type?: string }[] = [];
let currentBaseDir: string = '';
let currentWatcher: chokidar.FSWatcher | null = null;
let currentChurnMap = new Map<string, number>();

const pool = new Piscina({
  filename: path.join(__dirname, 'worker.js')
});

function ensureStructureLink(source: string, target: string, value: number = 10) {
  const exists = currentLinks.some(
    (link) => link.source === source && link.target === target && link.type === 'structure'
  );
  if (!exists) {
    currentLinks.push({ source, target, value, type: 'structure' });
  }
}

function ensureDirectoryChainForFile(filePath: string, baseDir: string) {
  const normalizedBaseDir = baseDir.replace(/\\/g, '/');
  let currentDir = path.dirname(filePath).replace(/\\/g, '/');

  while (
    currentDir.startsWith(normalizedBaseDir) &&
    currentDir !== normalizedBaseDir &&
    currentDir !== '.' &&
    currentDir !== path.dirname(currentDir).replace(/\\/g, '/')
  ) {
    if (!currentNodes.has(currentDir)) {
      currentNodes.set(currentDir, {
        id: currentDir,
        label: path.basename(currentDir),
        group: 0,
        type: 'directory',
        churn: 0
      });
    }

    const parentDir = path.dirname(currentDir).replace(/\\/g, '/');
    if (parentDir.startsWith(normalizedBaseDir) && parentDir !== normalizedBaseDir) {
      ensureStructureLink(currentDir, parentDir);
    }

    currentDir = parentDir;
  }

  const parentDir = path.dirname(filePath).replace(/\\/g, '/');
  if (parentDir.startsWith(normalizedBaseDir) && parentDir !== normalizedBaseDir) {
    ensureStructureLink(filePath, parentDir, 20);
  }
}

async function processFile(filePath: string, baseDir: string, isInitial: boolean = false) {
  const normalizedPath = filePath.replace(/\\/g, '/');
  const fileName = path.basename(normalizedPath);
  const churn = currentChurnMap.get(normalizedPath) || 1;
  
  try {
    const result = await pool.run(normalizedPath);

    // Для инкрементального апдейта сначала очищаем старые связи и вложенные сущности файла.
    if (!isInitial) {
      currentLinks = currentLinks.filter(l => l.source !== normalizedPath);
      for (const [id] of currentNodes) {
        if (id.startsWith(normalizedPath + '#')) {
          currentNodes.delete(id);
        }
      }
    }

    ensureDirectoryChainForFile(normalizedPath, baseDir);

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
        currentLinks.push({ source: normalizedPath, target: adrPathMatch, value: 3, type: 'adr' }); // Сильная связь с ADR
      }
    }

    // Добавляем импорты
    for (const imp of imports) {
      const dir = path.dirname(normalizedPath);
      const resolvedPath = path.resolve(dir, imp.path).replace(/\\/g, '/');
      
      // Если мы знаем конкретные функции, которые импортируются, связываем файл напрямую с ними
      if (imp.importedEntities && imp.importedEntities.length > 0) {
        for (const entityName of imp.importedEntities) {
          // Целевой ID сущности (функции или класса) в другом файле
          // Поскольку расширение импорта может быть опущено, мы будем резолвить это на этапе getValidGraph
          currentLinks.push({ 
            source: normalizedPath, 
            target: `${resolvedPath}#${entityName}`, 
            value: 2, 
            type: 'import' 
          });
        }
      } else {
        // Если конкретных сущностей нет, просто связываем файлы (default export/namespace)
        currentLinks.push({ source: normalizedPath, target: resolvedPath, value: 1, type: 'import' });
      }
    }

    // Папки восстанавливаются как отдельные узлы и участвуют в структуре графа.

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
      currentLinks.push({ source: normalizedPath, target: id, value: 100, type: 'entity' }); // Огромный вес, чтобы жестко прикрепить к файлу
    }
  } catch (e) {
    // Игнорируем ошибки парсинга конкретного файла
  }
}

function getValidGraph(): GraphData {
  // Очистка мертвых линков (импорты, которые не с резолвились в реальные файлы в nodes)
  const possibleExts = ['.ts', '.tsx', '.js', '.jsx', '/index.ts', '/index.js'];

  const validLinks = currentLinks.filter(l => {
    // Если это линк на сущность (Class/Function) в другом файле: `path/to/file#EntityName`
    if (l.target.includes('#')) {
      const exactMatch = currentNodes.has(l.target);
      if (exactMatch) return true;

      // Если расширения нет, пытаемся его подобрать
      const [filePath, entityName] = l.target.split('#');
      for (const ext of possibleExts) {
        const fullId = `${filePath}${ext}#${entityName}`;
        if (currentNodes.has(fullId)) {
          l.target = fullId;
          return true;
        }
      }
      
        // ФОЛБЭК: Если сущность не найдена, просто связываем файлы напрямую
        if (currentNodes.has(filePath)) {
          l.target = filePath;
          return true;
        }
        
        for (const ext of possibleExts) {
          const fullFile = `${filePath}${ext}`;
          if (currentNodes.has(fullFile)) {
            l.target = fullFile;
            return true;
          }
        }
        return false; // Сущность и файл не найдены (мертвый импорт)
      }
    
    // Если это обычный линк (на файл или папку)
    const exactMatch = currentNodes.has(l.target);
    if (exactMatch) return true;

    // Разрешаем линки на директории
    const targetNode = currentNodes.get(l.target);
    if (targetNode && targetNode.type === 'directory') return true;

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
  const cacheFile = path.join(cacheDir, `${cacheKey}_v4.json`); // v4 для фикса fallback-логики связей

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

  // Пересобираем структуру папок из актуального списка файлов, чтобы карта не зависела от старого кэша.
  for (const [id, node] of currentNodes) {
    if (node.type === 'directory') {
      currentNodes.delete(id);
    }
  }
  currentLinks = currentLinks.filter(link => link.type !== 'structure');
  allFiles.forEach(filePath => ensureDirectoryChainForFile(filePath.replace(/\\/g, '/'), baseDir));

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
    })
    .on('addDir', (dirPath: string) => {
      if (dirPath.includes('node_modules') || dirPath.includes('.git')) return;
      ensureDirectoryChainForFile(path.join(dirPath, '__placeholder__.ts').replace(/\\/g, '/'), baseDir);
      currentLinks = currentLinks.filter(link => link.source !== path.join(dirPath, '__placeholder__.ts').replace(/\\/g, '/'));
      if (mainWindow) mainWindow.webContents.send('graph-updated', getValidGraph());
      saveCacheDebounced();
    })
    .on('unlinkDir', (dirPath: string) => {
      const normalizedDir = dirPath.replace(/\\/g, '/');
      currentNodes.delete(normalizedDir);
      currentLinks = currentLinks.filter(l => l.source !== normalizedDir && l.target !== normalizedDir);
      if (mainWindow) mainWindow.webContents.send('graph-updated', getValidGraph());
      saveCacheDebounced();
    });

  return getValidGraph();
}
