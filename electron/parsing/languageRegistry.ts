import { languageQueries } from '../queries';
import { LanguageDefinition } from './types';

const ALL_LANGUAGES: LanguageDefinition[] = [
  {
    id: 'javascript',
    displayName: 'JavaScript',
    parserEngine: 'typescript-semantic',
    wasmName: 'javascript',
    extensions: ['.js', '.mjs', '.cjs', '.jsx'],
    query: languageQueries.javascript,
    capabilities: { entities: true, imports: true, variables: true, calls: true, comments: true },
  },
  {
    id: 'typescript',
    displayName: 'TypeScript',
    parserEngine: 'typescript-semantic',
    wasmName: 'typescript',
    extensions: ['.ts', '.mts', '.cts'],
    query: languageQueries.typescript,
    capabilities: { entities: true, imports: true, variables: true, calls: true, comments: true },
  },
  {
    id: 'tsx',
    displayName: 'TSX',
    parserEngine: 'typescript-semantic',
    wasmName: 'tsx',
    extensions: ['.tsx'],
    query: languageQueries.tsx,
    capabilities: { entities: true, imports: true, variables: true, calls: true, comments: true },
  },
  {
    id: 'python',
    displayName: 'Python',
    parserEngine: 'tree-sitter',
    wasmName: 'python',
    extensions: ['.py'],
    query: languageQueries.python,
    capabilities: { entities: true, imports: true, variables: true, calls: true, comments: true },
  },
  {
    id: 'go',
    displayName: 'Go',
    parserEngine: 'tree-sitter',
    wasmName: 'go',
    extensions: ['.go'],
    query: languageQueries.go,
    capabilities: { entities: true, imports: true, variables: true, calls: true, comments: true },
  },
  {
    id: 'rust',
    displayName: 'Rust',
    parserEngine: 'tree-sitter',
    wasmName: 'rust',
    extensions: ['.rs'],
    query: languageQueries.rust,
    capabilities: { entities: true, imports: true, variables: true, calls: true, comments: true },
  },
  {
    id: 'java',
    displayName: 'Java',
    parserEngine: 'tree-sitter',
    wasmName: 'java',
    extensions: ['.java'],
    query: languageQueries.java,
    capabilities: { entities: true, imports: true, variables: true, calls: true, comments: true },
  },
  {
    id: 'cpp',
    displayName: 'C/C++',
    parserEngine: 'tree-sitter',
    wasmName: 'cpp',
    extensions: ['.c', '.cc', '.cpp', '.h', '.hpp'],
    query: languageQueries.cpp,
    capabilities: { entities: true, imports: true, variables: true, calls: true, comments: true },
  },
  {
    id: 'c_sharp',
    displayName: 'C#',
    parserEngine: 'tree-sitter',
    wasmName: 'c_sharp',
    extensions: ['.cs'],
    query: languageQueries.c_sharp,
    capabilities: { entities: true, imports: true, variables: true, calls: true, comments: true },
  },
  {
    id: 'php',
    displayName: 'PHP',
    parserEngine: 'tree-sitter',
    wasmName: 'php',
    extensions: ['.php'],
    query: languageQueries.php,
    capabilities: { entities: true, imports: true, variables: true, calls: true, comments: true },
  },
  {
    id: 'ruby',
    displayName: 'Ruby',
    parserEngine: 'tree-sitter',
    wasmName: 'ruby',
    extensions: ['.rb'],
    query: languageQueries.ruby,
    capabilities: { entities: true, imports: true, variables: true, calls: true, comments: true },
  },
  {
    id: 'zig',
    displayName: 'Zig',
    parserEngine: 'tree-sitter',
    wasmName: 'zig',
    extensions: ['.zig'],
    query: languageQueries.zig,
    capabilities: { entities: true, imports: true, variables: true, calls: true, comments: true },
  },
  {
    id: 'swift',
    displayName: 'Swift',
    parserEngine: 'tree-sitter',
    wasmName: 'swift',
    extensions: ['.swift'],
    query: languageQueries.swift,
    capabilities: { entities: true, imports: true, variables: true, calls: true, comments: true },
  },
  {
    id: 'kotlin',
    displayName: 'Kotlin',
    parserEngine: 'tree-sitter',
    wasmName: 'kotlin',
    extensions: ['.kt', '.kts'],
    query: languageQueries.kotlin,
    capabilities: { entities: true, imports: true, variables: true, calls: true, comments: true },
  },
  {
    id: 'markdown',
    displayName: 'Markdown',
    parserEngine: 'markdown-adr',
    extensions: ['.md'],
    capabilities: { entities: false, imports: false, variables: false, calls: false, comments: false },
  },
];

const languageById = new Map(ALL_LANGUAGES.map((language) => [language.id, language]));
const languageByExtension = new Map<string, LanguageDefinition>();

for (const language of ALL_LANGUAGES) {
  for (const extension of language.extensions) {
    languageByExtension.set(extension, language);
  }
}

export const getAllLanguageDefinitions = () => ALL_LANGUAGES;

export const getLanguageById = (id: string) => languageById.get(id);

export const getLanguageByExtension = (extension: string) =>
  languageByExtension.get(extension.toLowerCase());
