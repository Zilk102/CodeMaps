import * as path from 'path';
import * as fs from 'fs/promises';
import Parser = require('web-tree-sitter');

const MAX_FILE_SIZE = 300 * 1024; // 300 KB limit per file

let parser: any;
let isParserInitialized = false;
const loadedLanguages = new Map<string, any>();

// Карта расширений в названия файлов wasm
const extToLangMap: Record<string, string> = {
  '.js': 'javascript',
  '.jsx': 'javascript',
  '.ts': 'typescript',
  '.tsx': 'tsx',
  '.py': 'python',
  '.go': 'go',
  '.rs': 'rust',
  '.java': 'java',
  '.c': 'c',
  '.cpp': 'cpp',
  '.h': 'cpp',
  '.hpp': 'cpp',
  '.cs': 'c_sharp',
  '.php': 'php',
  '.rb': 'ruby',
  '.zig': 'zig',
  '.swift': 'swift',
  '.kt': 'kotlin',
  '.kts': 'kotlin'
};

async function getLanguageForFile(filePath: string) {
  const ext = path.extname(filePath).toLowerCase();
  const langName = extToLangMap[ext];
  if (!langName) return null;

  if (loadedLanguages.has(langName)) {
    return loadedLanguages.get(langName);
  }

  try {
    const wasmDir = path.join(__dirname, '..', 'node_modules', 'tree-sitter-wasms', 'out');
    const wasmPath = path.join(wasmDir, `tree-sitter-${langName}.wasm`);
    const lang = await Parser.Language.load(wasmPath);
    loadedLanguages.set(langName, lang);
    return lang;
  } catch (e) {
    return null;
  }
}

export default async function parseWorker(filePath: string) {
  if (!isParserInitialized) {
    await Parser.init();
    parser = new Parser();
    isParserInitialized = true;
  }

  try {
    const stat = await fs.stat(filePath);
    if (stat.size > MAX_FILE_SIZE) {
      return { sizeExceeded: true, imports: [], entities: [], adr: undefined };
    }

    const text = await fs.readFile(filePath, 'utf-8');
    
    // Если это Markdown (ADR)
    if (filePath.toLowerCase().endsWith('.md')) {
      const adrTitleMatch = text.match(/^#\s+(.+)/m);
      const isADR = text.toLowerCase().includes('status:') && text.toLowerCase().includes('context');
      
      if (isADR) {
        return {
          sizeExceeded: false,
          imports: [],
          entities: [],
          adr: adrTitleMatch ? adrTitleMatch[1].trim() : path.basename(filePath),
          isMarkdownADR: true
        };
      }
      return { sizeExceeded: false, imports: [], entities: [], adr: undefined };
    }

    const adrMatch = text.match(/@adr\s+(.+)/i) || text.match(/ADR:\s+(.+)/i);
    const adr = adrMatch ? adrMatch[1].trim() : undefined;

    const lang = await getLanguageForFile(filePath);
    if (!lang) return { sizeExceeded: false, imports: [], entities: [], adr };

    parser.setLanguage(lang);
    const tree = parser.parse(text);
    
    const imports: { path: string, importedEntities: string[] }[] = [];
    const entities: { type: string; name: string }[] = [];

    // Очень простой обход AST для извлечения импортов, классов и функций
    const traverse = (node: any) => {
      // Ищем импорты
      if (node.type === 'import_statement' || node.type === 'import_declaration') {
        let importPath = '';
        const importedEntities: string[] = [];

        // Ищем путь (строковый литерал)
        const sourceNode = node.children.find((c: any) => c.type === 'string' || c.type === 'string_literal');
        if (sourceNode) {
          importPath = sourceNode.text.replace(/['"]/g, '');
        }

        // Ищем конкретные импортируемые сущности: import { A, B } from './c'
        const clauseNode = node.children.find((c: any) => c.type === 'import_clause' || c.type === 'named_imports');
        if (clauseNode) {
          const specifiers = clauseNode.children.filter((c: any) => c.type === 'import_specifier' || c.type === 'identifier');
          specifiers.forEach((spec: any) => {
            const nameNode = spec.children.find((c: any) => c.type === 'identifier') || spec;
            if (nameNode.type === 'identifier') importedEntities.push(nameNode.text);
          });
        }

        if (importPath && (importPath.startsWith('.') || importPath.startsWith('/'))) {
          imports.push({ path: importPath, importedEntities });
        }
      } 
      // Классы
      else if (node.type.includes('class') && node.type.includes('declaration')) {
        const nameNode = node.children.find((c: any) => c.type === 'identifier' || c.type === 'type_identifier');
        if (nameNode) entities.push({ type: 'class', name: nameNode.text });
      } 
      // Функции/методы
      else if ((node.type.includes('function') || node.type.includes('method')) && node.type.includes('declaration')) {
        const nameNode = node.children.find((c: any) => c.type === 'identifier' || c.type === 'name');
        if (nameNode) entities.push({ type: 'function', name: nameNode.text });
      } 
      // Переменные с функциями (JS/TS)
      else if (node.type === 'variable_declarator') {
        const nameNode = node.children.find((c: any) => c.type === 'identifier');
        const isFunc = node.children.some((c: any) => c.type === 'arrow_function' || c.type === 'function');
        if (nameNode && isFunc) entities.push({ type: 'function', name: nameNode.text });
      }
      
      node.children.forEach(traverse);
    };

    traverse(tree.rootNode);
    return { sizeExceeded: false, imports, entities, adr };
  } catch (e) {
    return { sizeExceeded: false, imports: [], entities: [], adr: undefined };
  }
}
