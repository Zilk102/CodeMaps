import * as path from 'path';
import type { LanguageDefinition } from './types';

import { Parser, Language } from 'web-tree-sitter';

let parserInstance: Parser | null = null;
let isParserInitialized = false;
const loadedLanguages = new Map<string, Language>();

const getWasmDirectory = () =>
  path.join(__dirname, '..', '..', 'node_modules', 'tree-sitter-wasms', 'out');

export const getParserInstance = async (): Promise<Parser> => {
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

export const loadTreeSitterLanguage = async (
  definition: LanguageDefinition
): Promise<Language | null> => {
  if (!definition.wasmName) {
    return null;
  }

  if (loadedLanguages.has(definition.id)) {
    return loadedLanguages.get(definition.id)!;
  }

  const wasmPath = path.join(getWasmDirectory(), `tree-sitter-${definition.wasmName}.wasm`);
  const language = await Language.load(wasmPath);
  loadedLanguages.set(definition.id, language);
  return language;
};
