import * as fs from 'fs/promises';
import * as path from 'path';
import { getLanguageByExtension } from './languageRegistry';
import { extractMarkdownAdr } from './extractors/markdownAdrExtractor';
import { extractWithTreeSitterQuery } from './extractors/treeSitterQueryExtractor';
import { getParserInstance, loadTreeSitterLanguage } from './treeSitterRuntime';
import { ParseResult, ParseWorkerInput } from './types';

const MAX_FILE_SIZE = 300 * 1024;

const emptyResult = (detectedLanguage?: string, adr?: string): ParseResult => ({
  sizeExceeded: false,
  imports: [],
  entities: [],
  adr,
  variables: [],
  calls: [],
  comments: [],
  detectedLanguage,
});

export const parseFile = async ({ filePath, activeLanguageIds }: ParseWorkerInput): Promise<ParseResult> => {
  const extension = path.extname(filePath).toLowerCase();
  const definition = getLanguageByExtension(extension);

  if (!definition) {
    return emptyResult();
  }

  if (activeLanguageIds?.length && !activeLanguageIds.includes(definition.id)) {
    return emptyResult(definition.id);
  }

  try {
    const stat = await fs.stat(filePath);
    if (stat.size > MAX_FILE_SIZE) {
      return { ...emptyResult(definition.id), sizeExceeded: true };
    }

    const text = await fs.readFile(filePath, 'utf-8');

    if (definition.parserEngine === 'markdown-adr') {
      return extractMarkdownAdr(filePath, text);
    }

    const adrMatch = text.match(/@adr\s+(.+)/i) || text.match(/ADR:\s+(.+)/i);
    const adr = adrMatch ? adrMatch[1].trim() : undefined;

    const parser = await getParserInstance();
    const language = await loadTreeSitterLanguage(definition);

    if (!language) {
      return emptyResult(definition.id, adr);
    }

    parser.setLanguage(language);
    const tree = parser.parse(text);
    return extractWithTreeSitterQuery(tree, language, definition, adr);
  } catch {
    return emptyResult(definition.id);
  }
};
