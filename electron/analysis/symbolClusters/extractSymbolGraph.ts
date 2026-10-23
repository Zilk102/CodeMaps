import * as fs from 'fs/promises';
import * as path from 'path';
import { MAX_ANALYZED_FILE_SIZE } from '../../parsing/fileLimits';
import { extractTypeScript } from './extractTsSymbolGraph';
import { extractWithTreeSitter } from './extractTreeSitterSymbolGraph';
import type { SymbolGraph } from './types';

const TS_EXTENSIONS = new Set(['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs', '.mts', '.cts']);

/**
 * Reads one source file and returns its declarations with which of them use which, or null
 * when the language is not supported or the file is too large to read.
 */
export const extractSymbolGraph = async (filePath: string): Promise<SymbolGraph | null> => {
  const extension = path.extname(filePath).toLowerCase();
  const stat = await fs.stat(filePath).catch(() => null);
  if (!stat || stat.size > MAX_ANALYZED_FILE_SIZE) return null;
  const text = await fs.readFile(filePath, 'utf-8');

  if (TS_EXTENSIONS.has(extension)) return extractTypeScript(filePath, text);
  return extractWithTreeSitter(filePath, text, extension);
};
