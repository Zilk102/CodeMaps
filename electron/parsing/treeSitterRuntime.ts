import * as path from 'path';
import type { LanguageDefinition } from './types';

import { Parser, Language } from 'web-tree-sitter';

let parserInstance: Parser | null = null;
let initPromise: Promise<void> | null = null;
const loadedLanguages = new Map<string, Language>();
const loadingLanguages = new Map<string, Promise<Language>>();

const getWasmDirectory = () =>
  path.join(__dirname, '..', '..', 'node_modules', 'tree-sitter-wasms', 'out');

// Language.load() reaches into the Emscripten runtime that Parser.init() sets up,
// so every entry point has to go through this before touching web-tree-sitter.
const ensureRuntimeInitialized = async (): Promise<void> => {
  if (!initPromise) {
    initPromise = Parser.init().catch((error) => {
      initPromise = null;
      throw error;
    });
  }

  return initPromise;
};

export const getParserInstance = async (): Promise<Parser> => {
  await ensureRuntimeInitialized();

  if (!parserInstance) {
    parserInstance = new Parser();
  }

  return parserInstance;
};

export const loadTreeSitterLanguage = async (
  definition: LanguageDefinition
): Promise<Language | null> => {
  if (!definition.wasmName) {
    return null;
  }

  const cached = loadedLanguages.get(definition.id);
  if (cached) {
    return cached;
  }

  const pending = loadingLanguages.get(definition.id);
  if (pending) {
    return pending;
  }

  const load = (async () => {
    await ensureRuntimeInitialized();
    const wasmPath = path.join(getWasmDirectory(), `tree-sitter-${definition.wasmName}.wasm`);
    const language = await Language.load(wasmPath);
    loadedLanguages.set(definition.id, language);
    return language;
  })().finally(() => {
    loadingLanguages.delete(definition.id);
  });

  loadingLanguages.set(definition.id, load);
  return load;
};
