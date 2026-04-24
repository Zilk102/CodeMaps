import * as path from 'path';
import { ParseResult } from '../types';

export const extractMarkdownAdr = (filePath: string, text: string): ParseResult => {
  const adrTitleMatch = text.match(/^#\s+(.+)/m);
  const isADR = text.toLowerCase().includes('status:') && text.toLowerCase().includes('context');

  if (isADR) {
    return {
      sizeExceeded: false,
      imports: [],
      entities: [],
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
    adr: undefined,
    variables: [],
    calls: [],
    comments: [],
    detectedLanguage: 'markdown',
  };
};
