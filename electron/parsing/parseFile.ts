import * as fs from 'fs/promises';
import * as path from 'path';
import { getLanguageAdapter } from './languageAdapters';
import { getLanguageByExtension } from './languageRegistry';
import { createEmptyParseResult, extractAdrReference } from './parseResultUtils';
import { ParseResult, ParseWorkerInput } from './types';

const MAX_FILE_SIZE = 300 * 1024;

export const parseFile = async ({
  filePath,
  activeLanguageIds,
  baseDir,
}: ParseWorkerInput): Promise<ParseResult> => {
  const extension = path.extname(filePath).toLowerCase();
  const definition = getLanguageByExtension(extension);

  if (!definition) {
    return createEmptyParseResult();
  }

  if (activeLanguageIds?.length && !activeLanguageIds.includes(definition.id)) {
    return createEmptyParseResult(definition.id);
  }

  try {
    const stat = await fs.stat(filePath);
    if (stat.size > MAX_FILE_SIZE) {
      return { ...createEmptyParseResult(definition.id), sizeExceeded: true };
    }

    const text = await fs.readFile(filePath, 'utf-8');

    const adapter = getLanguageAdapter(definition);
    const adr = definition.parserEngine === 'markdown-adr' ? undefined : extractAdrReference(text);

    if (!adapter) {
      return createEmptyParseResult(definition.id, adr);
    }

    return adapter.parse({
      filePath,
      text,
      definition,
      adr,
      baseDir,
    });
  } catch {
    return createEmptyParseResult(definition.id);
  }
};
