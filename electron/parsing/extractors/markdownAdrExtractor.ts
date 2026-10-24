// Reads a Markdown file only to tell whether it is an architecture decision record (ADR).

import * as path from 'path';
import { ParseResult } from '../types';

/**
 * Parse result for a Markdown file. A file counts as an ADR when its text mentions both `status:`
 * and `context` (any case); it then carries the first `# ` heading, or the file name, as `adr` and
 * `isMarkdownADR`. All other facts are empty.
 */
export const extractMarkdownAdr = (filePath: string, text: string): ParseResult => {
  const adrTitleMatch = text.match(/^#\s+(.+)/m);
  const isADR = text.toLowerCase().includes('status:') && text.toLowerCase().includes('context');

  if (isADR) {
    return {
      sizeExceeded: false,
      imports: [],
      entities: [],
      exports: [],
      adr: adrTitleMatch ? adrTitleMatch[1].trim() : path.basename(filePath),
      isMarkdownADR: true,
      variables: [],
      calls: [],
      comments: [],
      detectedLanguage: 'markdown',
    };
  }

  return {
    sizeExceeded: false,
    imports: [],
    entities: [],
    exports: [],
    adr: undefined,
    variables: [],
    calls: [],
    comments: [],
    detectedLanguage: 'markdown',
  };
};
