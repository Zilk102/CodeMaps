import * as path from 'path';
import type { LanguageDefinition } from './types';

// web-tree-sitter types (0.22.x compatible)
interface ParserStatic {
  init(moduleOptions?: object): Promise<void>;
  new (): ParserInstance;
  Language: {
    load(input: string | Uint8Array): Promise<LanguageInstance>;
  };
}

interface ParserInstance {
  setLanguage(language?: LanguageInstance | null): void;
  parse(input: string): any;
}

interface LanguageInstance {
  // Language interface
}

// Use require for CommonJS module
const Parser: ParserStatic = require('web-tree-sitter');

let parserInstance: ParserInstance | null = null;
let isParserInitialized = false;
const loadedLanguages = new Map<string, LanguageInstance>();

const getWasmDirectory = () => path.join(__dirname, '..', '..', 'node_modules', 'tree-sitter-wasms', 'out');

export const getParserInstance = async (): Promise<ParserInstance> => {
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

export const loadTreeSitterLanguage = async (definition: LanguageDefinition): Promise<LanguageInstance | null> => {
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
