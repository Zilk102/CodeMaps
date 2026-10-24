// Shared web-tree-sitter runtime: one initialisation, one parser instance and a cache of loaded
// grammars.

import * as path from 'path';
import type { LanguageDefinition } from './types';

import { Parser, Language } from 'web-tree-sitter';

let parserInstance: Parser | null = null;
let initPromise: Promise<void> | null = null;
const loadedLanguages = new Map<string, Language>();
const loadingLanguages = new Map<string, Promise<Language>>();

/** Environment variable that points at a folder holding the grammars and `tree-sitter.wasm`; the bundled CI guard ships its own copy there. */
export const WASM_DIR_ENV = 'CODEMAPS_WASM_DIR';

const getWasmDirectory = () =>
  process.env[WASM_DIR_ENV] ??
  path.join(__dirname, '..', '..', 'node_modules', 'tree-sitter-wasms', 'out');

/** Runtime options: with a configured folder the core `tree-sitter.wasm` is looked up there too, because a bundle has no node_modules next to it. */
const runtimeOptions = () =>
  process.env[WASM_DIR_ENV]
    ? { locateFile: (name: string) => path.join(getWasmDirectory(), name) }
    : undefined;

// Language.load() reaches into the Emscripten runtime that Parser.init() sets up,
// so every entry point has to go through this before touching web-tree-sitter.
/**
 * Initialises the web-tree-sitter runtime once. A failed initialisation is not cached, so the next
 * call retries.
 */
const ensureRuntimeInitialized = async (): Promise<void> => {
  if (!initPromise) {
    initPromise = Parser.init(runtimeOptions()).catch((error) => {
      initPromise = null;
      throw error;
    });
  }

  return initPromise;
};

/**
 * The single shared parser. Callers must call `setLanguage` right before each parse, since the
 * instance is reused for every language.
 */
export const getParserInstance = async (): Promise<Parser> => {
  await ensureRuntimeInitialized();

  if (!parserInstance) {
    parserInstance = new Parser();
  }

  return parserInstance;
};

/**
 * Loads the grammar of a language from the bundled wasm files, once: parallel calls share one load.
 * Null for languages without a grammar.
 */
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
