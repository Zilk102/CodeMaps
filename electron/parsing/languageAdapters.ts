import { extractMarkdownAdr } from './extractors/markdownAdrExtractor';
import { extractWithTreeSitterQuery } from './extractors/treeSitterQueryExtractor';
import { extractWithTypeScriptSemantic } from './extractors/typescriptSemanticExtractor';
import { createEmptyParseResult } from './parseResultUtils';
import { getParserInstance, loadTreeSitterLanguage } from './treeSitterRuntime';
import { LanguageAdapter, LanguageAdapterId, LanguageDefinition } from './types';

const createEngineAdapter = (
  adapter: Omit<LanguageAdapter, 'supports'> & {
    supports?: (definition: LanguageDefinition) => boolean;
  }
): LanguageAdapter => ({
  ...adapter,
  supports: adapter.supports || ((definition) => definition.adapterId === adapter.id),
});

const markdownAdrAdapter = createEngineAdapter({
  id: 'markdown-adr-adapter',
  parserEngines: ['markdown-adr'],
  parse: async ({ filePath, text }) => extractMarkdownAdr(filePath, text),
});

const typeScriptSemanticAdapter = createEngineAdapter({
  id: 'typescript-semantic-adapter',
  parserEngines: ['typescript-semantic'],
  parse: async ({ filePath, text, definition, adr, baseDir }) =>
    extractWithTypeScriptSemantic(filePath, text, definition, adr, baseDir),
});

const treeSitterAdapter = createEngineAdapter({
  id: 'tree-sitter-query-adapter',
  parserEngines: ['tree-sitter'],
  parse: async ({ text, definition, adr }) => {
    const parser = await getParserInstance();
    const language = await loadTreeSitterLanguage(definition);

    if (!language) {
      return createEmptyParseResult(definition.id, adr);
    }

    parser.setLanguage(language);
    const tree = parser.parse(text);
    if (!tree) {
      return createEmptyParseResult(definition.id, adr);
    }

    return extractWithTreeSitterQuery(tree, language, definition, adr);
  },
});

const BUILTIN_LANGUAGE_ADAPTERS: Record<LanguageAdapterId, LanguageAdapter> = {
  'markdown-adr-adapter': markdownAdrAdapter,
  'typescript-semantic-adapter': typeScriptSemanticAdapter,
  'tree-sitter-query-adapter': treeSitterAdapter,
};

export const getBuiltinLanguageAdapters = () => Object.values(BUILTIN_LANGUAGE_ADAPTERS);

export const getLanguageAdapter = (definition: LanguageDefinition) =>
  BUILTIN_LANGUAGE_ADAPTERS[definition.adapterId];
