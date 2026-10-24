// Finds and caches the tsconfig compiler options of a project and resolves module specifiers with
// them.

import * as fs from 'fs';
import * as path from 'path';
import ts from 'typescript';

type TypeScriptProjectContext = {
  configPath?: string;
  compilerOptions: ts.CompilerOptions;
};

const contextCache = new Map<string, TypeScriptProjectContext>();

const normalizePath = (value: string) => value.replace(/\\/g, '/');

/**
 * Nearest `tsconfig.json` or `jsconfig.json` walking up from the file, tsconfig first in each
 * directory. Stops at the filesystem root or when the walk would leave `baseDir`; undefined if none
 * is found.
 */
const findNearestTsConfig = (filePath: string, baseDir?: string) => {
  let currentDir = path.dirname(filePath);
  const normalizedBaseDir = baseDir ? normalizePath(baseDir) : undefined;

  while (true) {
    const tsconfigPath = path.join(currentDir, 'tsconfig.json');
    const jsconfigPath = path.join(currentDir, 'jsconfig.json');

    if (fs.existsSync(tsconfigPath)) return tsconfigPath;
    if (fs.existsSync(jsconfigPath)) return jsconfigPath;

    const parentDir = path.dirname(currentDir);
    if (parentDir === currentDir) return undefined;

    if (normalizedBaseDir && !normalizePath(parentDir).startsWith(normalizedBaseDir)) {
      return undefined;
    }

    currentDir = parentDir;
  }
};

/**
 * Fallback options for projects without a usable config: modern ESM with the bundler resolution, JS
 * allowed, React JSX.
 */
const createDefaultCompilerOptions = (): ts.CompilerOptions => ({
  allowJs: true,
  checkJs: false,
  target: ts.ScriptTarget.ES2022,
  module: ts.ModuleKind.ESNext,
  moduleResolution: ts.ModuleResolutionKind.Bundler,
  resolveJsonModule: true,
  esModuleInterop: true,
  allowSyntheticDefaultImports: true,
  jsx: ts.JsxEmit.ReactJSX,
});

/**
 * Compiler options of a config file layered over the defaults. An unreadable or invalid config
 * falls back to the defaults.
 */
const loadCompilerOptions = (configPath?: string): ts.CompilerOptions => {
  if (!configPath) {
    return createDefaultCompilerOptions();
  }

  try {
    const readResult = ts.readConfigFile(configPath, ts.sys.readFile);
    if (readResult.error) {
      return createDefaultCompilerOptions();
    }

    const parsedConfig = ts.parseJsonConfigFileContent(
      readResult.config,
      ts.sys,
      path.dirname(configPath),
      undefined,
      configPath
    );

    return {
      ...createDefaultCompilerOptions(),
      ...parsedConfig.options,
    };
  } catch {
    return createDefaultCompilerOptions();
  }
};

/**
 * Compiler options that apply to a file, cached per config file (or per base directory when there
 * is none). Config changes are not picked up until the process restarts.
 */
export const getTypeScriptProjectContext = (
  filePath: string,
  baseDir?: string
): TypeScriptProjectContext => {
  const configPath = findNearestTsConfig(filePath, baseDir);
  const cacheKey = configPath || `__default__:${baseDir || path.dirname(filePath)}`;

  if (contextCache.has(cacheKey)) {
    return contextCache.get(cacheKey)!;
  }

  const context: TypeScriptProjectContext = {
    configPath,
    compilerOptions: loadCompilerOptions(configPath),
  };

  contextCache.set(cacheKey, context);
  return context;
};

/**
 * Resolves an import specifier to a file path with forward slashes, using the options of the
 * importing file. Undefined when it cannot be resolved or resolves outside `baseDir`.
 */
export const resolveTypeScriptModule = (
  specifier: string,
  containingFile: string,
  baseDir?: string
) => {
  const context = getTypeScriptProjectContext(containingFile, baseDir);
  const host: ts.ModuleResolutionHost = ts.sys;
  const resolution = ts.resolveModuleName(specifier, containingFile, context.compilerOptions, host);
  const resolvedFileName = resolution.resolvedModule?.resolvedFileName;

  if (!resolvedFileName) {
    return undefined;
  }

  const normalized = normalizePath(resolvedFileName);
  if (baseDir && !normalized.startsWith(normalizePath(baseDir))) {
    return undefined;
  }

  return normalized;
};
