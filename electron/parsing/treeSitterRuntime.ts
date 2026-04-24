import * as path from 'path';
import Parser = require('web-tree-sitter');
import { LanguageDefinition } from './types';

let parserInstance: Parser | null = null;
let isParserInitialized = false;
const loadedLanguages = new Map<string, Parser.Language>();

const getWasmDirectory = () => path.join(__dirname, '..', '..', 'node_modules', 'tree-sitter-wasms', 'out');

export const getParserInstance = async () => {
  if (!isParserInitialized) {
    await Parser.init();
    parserInstance = new Parser();
    isParserInitialized = true;
  }

  if (!parserInstance) {
    throw new Error('Tree-sitter parser instance is not initialized');
  }

  return parserInstance;
};

export const loadTreeSitterLanguage = async (definition: LanguageDefinition) => {
  if (!definition.wasmName) {
    return null;
  }

  if (loadedLanguages.has(definition.id)) {
    return loadedLanguages.get(definition.id)!;
  }

  const wasmPath = path.join(getWasmDirectory(), `tree-sitter-${definition.wasmName}.wasm`);
  const language = await Parser.Language.load(wasmPath);
  loadedLanguages.set(definition.id, language);
  return language;
};
