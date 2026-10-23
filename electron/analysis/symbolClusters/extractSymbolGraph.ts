import { MAX_ANALYZED_FILE_SIZE } from '../../parsing/fileLimits';
import { extractTypeScript } from './extractTsSymbolGraph';
import { extractWithTreeSitter } from './extractTreeSitterSymbolGraph';
import { readSourceText, TS_EXTENSIONS } from '../sourceText';
import type { SymbolGraph } from './types';

/**
 * Reads one source file and returns its declarations with which of them use which, or null
 * when the language is not supported or the file is too large to read.
 */
export const extractSymbolGraph = async (filePath: string): Promise<SymbolGraph | null> => {
  const source = await readSourceText(filePath, MAX_ANALYZED_FILE_SIZE);
  if (!source) return null;
  const { extension, text } = source;

  if (TS_EXTENSIONS.has(extension)) return extractTypeScript(filePath, text);
  return extractWithTreeSitter(filePath, text, extension);
};
