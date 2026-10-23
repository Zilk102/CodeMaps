import * as fs from 'fs/promises';
import * as path from 'path';

/** Extensions the TypeScript compiler API reads; every other language goes through tree-sitter. */
export const TS_EXTENSIONS = new Set([
  '.ts',
  '.tsx',
  '.js',
  '.jsx',
  '.mjs',
  '.cjs',
  '.mts',
  '.cts',
]);

export interface SourceText {
  /** Lower-cased, with the dot. */
  extension: string;
  text: string;
}

/** Reads a source file as text, or returns null when it is missing or larger than `maxBytes`. */
export const readSourceText = async (
  filePath: string,
  maxBytes: number
): Promise<SourceText | null> => {
  const stat = await fs.stat(filePath).catch(() => null);
  if (!stat || stat.size > maxBytes) return null;
  return {
    extension: path.extname(filePath).toLowerCase(),
    text: await fs.readFile(filePath, 'utf-8'),
  };
};
