import * as path from 'path';

export const ORACLE_CACHE_VERSION = 9;

export const ORACLE_IGNORE_GLOBS = [
  '**/node_modules/**',
  '**/dist/**',
  '**/dist-electron/**',
  '**/dist-renderer/**',
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
  '**/*.bin',
  '**/*.pyc',
  '**/*.class',
  '**/*.asar',
];

export const normalizePath = (value: string) => value.replace(/\\/g, '/');

export const shouldIgnorePath = (filePath: string) => {
  const normalized = normalizePath(filePath).toLowerCase();
  return (
    normalized.includes('/node_modules/') ||
    normalized.includes('/.git/') ||
    normalized.includes('/dist/') ||
    normalized.includes('/dist-electron/') ||
    normalized.includes('/dist-renderer/') ||
    normalized.includes('/release/') ||
    normalized.includes('/build/') ||
    normalized.includes('/coverage/') ||
    normalized.includes('/out/') ||
    normalized.endsWith('.asar')
  );
};

export const isLocalSpecifier = (specifier: string) =>
  specifier.startsWith('.') || specifier.startsWith('/') || /^[A-Za-z]:[\\/]/.test(specifier);

export const getParentDir = (targetPath: string) => normalizePath(path.dirname(targetPath));
