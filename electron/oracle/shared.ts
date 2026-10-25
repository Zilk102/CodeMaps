/** Constants and path helpers shared by the oracle modules: cache version, ignore rules and path normalization. */

import * as path from 'path';

export const ORACLE_CACHE_VERSION = 12;

/**
 * Folders and files the indexer never parses. `node_modules*` also covers vendored copies such as
 * `node_modules-local`, which otherwise pull hundreds of thousands of dependency symbols into the
 * graph and turn a few thousand source files into a graph that takes minutes to index.
 */
export const ORACLE_IGNORE_GLOBS = [
  '**/node_modules/**',
  '**/node_modules*/**',
  '**/pnpm-local/**',
  '**/playwright-report/**',
  '**/dist/**',
  '**/dist-electron/**',
  '**/dist-renderer/**',
  '**/dist-guard/**',
  '**/build/**',
  '**/release/**',
  '**/.git/**',
  '**/.idea/**',
  '**/.vscode/**',
  '**/venv/**',
  '**/__pycache__/**',
  '**/target/**',
  '**/out/**',
  '**/coverage/**',
  '**/tmp/**',
  '**/.*',
  '**/*.lock',
  '**/pnpm-lock.yaml',
  '**/yarn.lock',
  '**/package-lock.json',
  '**/*.png',
  '**/*.jpg',
  '**/*.jpeg',
  '**/*.gif',
  '**/*.svg',
  '**/*.ico',
  '**/*.webp',
  '**/*.mp4',
  '**/*.webm',
  '**/*.ogg',
  '**/*.mp3',
  '**/*.wav',
  '**/*.pdf',
  '**/*.zip',
  '**/*.tar',
  '**/*.gz',
  '**/*.rar',
  '**/*.7z',
  '**/*.woff',
  '**/*.woff2',
  '**/*.ttf',
  '**/*.eot',
  '**/*.exe',
  '**/*.dll',
  '**/*.so',
  '**/*.dylib',
  '**/*.dat',
  '**/*.pak',
  '**/*.bin',
  '**/*.pyc',
  '**/*.class',
  '**/*.asar',
  '**/*.sqlite',
  '**/*.sqlite3',
  '**/*.db',
  '**/*.log',
  '**/*.map',
  '**/*.tsbuildinfo',
  '**/LICENSES.chromium.html',
];

/** Converts backslashes to forward slashes, the spelling graph ids use. */
export const normalizePath = (value: string) => value.replace(/\\/g, '/');

const IGNORED_DIRECTORY_SEGMENTS = [
  '/node_modules/',
  '/.git/',
  '/dist/',
  '/dist-electron/',
  '/dist-renderer/',
  '/release/',
  '/build/',
  '/coverage/',
  '/out/',
];

const IGNORED_FILE_SUFFIXES = [
  '.asar',
  '.dat',
  '.pak',
  '.bin',
  '.db',
  '.sqlite',
  '.sqlite3',
  '.log',
  '.map',
  '.tsbuildinfo',
];

/** Dependency folders under any name, including vendored variants such as `node_modules-local` or `node_modules.old`. */
const DEPENDENCY_DIRECTORY_SEGMENT = /\/(?:node_modules[^/]*|\.?pnpm[^/]*)\//;

/** Whether a path lies in an excluded folder (dependencies, build output, VCS) or has an excluded suffix (binary or database files). Used for watcher events, which bypass the glob filter. */
export const shouldIgnorePath = (filePath: string) => {
  const normalized = normalizePath(filePath).toLowerCase();
  return (
    IGNORED_DIRECTORY_SEGMENTS.some((segment) => normalized.includes(segment)) ||
    DEPENDENCY_DIRECTORY_SEGMENT.test(normalized) ||
    IGNORED_FILE_SUFFIXES.some((suffix) => normalized.endsWith(suffix)) ||
    normalized.includes('licenses.chromium.html')
  );
};

/** Whether an import specifier is a file path (relative, absolute or drive-letter) rather than a package name. */
export const isLocalSpecifier = (specifier: string) =>
  specifier.startsWith('.') || specifier.startsWith('/') || /^[A-Za-z]:[\\/]/.test(specifier);

/** Parent directory of a path, with forward slashes. */
export const getParentDir = (targetPath: string) => normalizePath(path.dirname(targetPath));
