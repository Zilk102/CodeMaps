import fg from 'fast-glob';
import * as path from 'path';
import * as fs from 'fs/promises';
import simpleGit from 'simple-git';

export interface GraphData {
  nodes: { id: string; label: string; group: number; type: string; churn?: number; adr?: string }[];
  links: { source: string; target: string; value: number }[];
  projectRoot: string;
}

const MAX_FILE_SIZE = 1024 * 1024; // 1 MB limit per file

export async function analyzeProject(baseDir: string): Promise<GraphData> {
  const git = simpleGit(baseDir);
  const isRepo = await git.checkIsRepo();
  const churnMap = new Map<string, number>();

  if (isRepo) {
    try {
      const raw = await git.raw(['log', '--name-only', '--pretty=format:']);
      const lines = raw.split('\n').filter(Boolean);
      lines.forEach(line => {
        const absPath = path.join(baseDir, line).replace(/\\/g, '/');
        churnMap.set(absPath, (churnMap.get(absPath) || 0) + 1);
      });
    } catch (e) {
      console.warn('Git history extraction failed:', e);
    }
  }

  const nodes: Map<string, { id: string; label: string; group: number; type: string; churn: number; adr?: string }> = new Map();
  const links: { source: string; target: string; value: number }[] = [];

  const allFiles = await fg('**/*.{ts,tsx,js,jsx,py,go,rs,java,c,cpp,h,hpp,cs,php,rb,md,txt,json,yml,yaml,toml,html,css}', { 
    cwd: baseDir, 
    absolute: true,
    ignore: [
      '**/node_modules/**', '**/dist/**', '**/build/**', '**/.git/**', 
      '**/.idea/**', '**/.vscode/**', '**/venv/**', '**/__pycache__/**', '**/target/**',
      '**/out/**', '**/coverage/**', '**/tmp/**'
    ]
  });

  if (allFiles.length === 0) {
    throw new Error("No source code files found in the selected directory.");
  }

  // Оптимизированный пофайловый стриминговый парсинг (без удержания всего AST в памяти)
  for (const filePath of allFiles) {
    const normalizedPath = filePath.replace(/\\/g, '/');
    const fileName = path.basename(normalizedPath);
    const churn = churnMap.get(normalizedPath) || 1;
    
    let adr: string | undefined;
    let isJS = !!normalizedPath.match(/\.(ts|tsx|js|jsx)$/);
    
    try {
      const stat = await fs.stat(normalizedPath);
      if (stat.size > MAX_FILE_SIZE) {
        // Пропускаем гигантские файлы (бандлы, логи)
        if (!nodes.has(normalizedPath)) {
          nodes.set(normalizedPath, { id: normalizedPath, label: fileName, group: 1, type: 'file', churn });
        }
        continue;
      }

      const text = await fs.readFile(normalizedPath, 'utf-8');
      
      // Поиск ADR
      const adrMatch = text.match(/@adr\s+(.+)/i) || text.match(/ADR:\s+(.+)/i);
      if (adrMatch) adr = adrMatch[1].trim();

      if (!nodes.has(normalizedPath)) {
        nodes.set(normalizedPath, { id: normalizedPath, label: fileName, group: 1, type: 'file', churn, adr });
      }

      if (isJS) {
        // Быстрый Regex парсинг импортов
        const importRegex = /import\s+.*?(?:from\s+)?['"](.*?)['"]/g;
        let match;
        while ((match = importRegex.exec(text)) !== null) {
          const importPath = match[1];
          if (!importPath.startsWith('.') && !importPath.startsWith('/')) continue; // Игнор node_modules/внешних

          // Простая попытка резолва (без учета index.ts и алиасов - для скорости MVP)
          const dir = path.dirname(normalizedPath);
          const resolvedPath = path.resolve(dir, importPath).replace(/\\/g, '/');
          
          // Для простоты связываем как "вероятную зависимость"
          links.push({ source: normalizedPath, target: resolvedPath, value: 1 });
        }

        // Быстрый Regex парсинг классов и функций
        const classRegex = /class\s+([A-Za-z0-9_]+)/g;
        while ((match = classRegex.exec(text)) !== null) {
          const id = `${normalizedPath}#${match[1]}`;
          nodes.set(id, { id, label: match[1], group: 2, type: 'class', churn: 1 });
          links.push({ source: normalizedPath, target: id, value: 2 });
        }

        const funcRegex = /(?:function\s+([A-Za-z0-9_]+))|(?:const|let|var)\s+([A-Za-z0-9_]+)\s*=\s*(?:async\s*)?(?:\([^)]*\)|[A-Za-z0-9_]+)\s*=>/g;
        while ((match = funcRegex.exec(text)) !== null) {
          const fnName = match[1] || match[2];
          if (fnName) {
            const id = `${normalizedPath}#${fnName}`;
            nodes.set(id, { id, label: fnName, group: 3, type: 'function', churn: 1 });
            links.push({ source: normalizedPath, target: id, value: 2 });
          }
        }
      }

    } catch (e) {
      // Игнорируем бинарники или ошибки чтения
    }
  }

  // Очистка мертвых линков (импорты, которые не с резолвились в реальные файлы в nodes)
  const validLinks = links.filter(l => {
    // Если таргет это внутренний класс/функция (содержит #) — оставляем
    if (l.target.includes('#')) return true;
    
    // Если таргет это файл — пытаемся найти точный матчинг (учитывая, что расширение могло быть не указано)
    const exactMatch = nodes.has(l.target);
    if (exactMatch) return true;

    const possibleExts = ['.ts', '.tsx', '.js', '.jsx', '/index.ts', '/index.js'];
    for (const ext of possibleExts) {
      const p = l.target + ext;
      if (nodes.has(p)) {
        l.target = p; // Переписываем линк на точный файл
        return true;
      }
    }
    return false;
  });

  return {
    projectRoot: baseDir,
    nodes: Array.from(nodes.values()),
    links: validLinks
  };
}