import { describe, expect, it } from 'vitest';
import { getAllLanguageDefinitions } from '../languageRegistry';
import { getParserInstance, loadTreeSitterLanguage } from '../treeSitterRuntime';

const treeSitterDefinitions = getAllLanguageDefinitions().filter(
  (definition) => definition.parserEngine === 'tree-sitter' && definition.wasmName
);

describe('tree-sitter runtime', () => {
  it('declares at least one tree-sitter backed language', () => {
    expect(treeSitterDefinitions.length).toBeGreaterThan(0);
  });

  // Guards against web-tree-sitter/tree-sitter-wasms ABI drift: a runtime that cannot
  // load the prebuilt grammars silently degrades every non-TypeScript language to an
  // empty parse result instead of failing the build.
  it.each(treeSitterDefinitions.map((definition) => [definition.id, definition] as const))(
    'loads the prebuilt grammar for %s',
    async (_id, definition) => {
      const language = await loadTreeSitterLanguage(definition);
      expect(language).not.toBeNull();
    }
  );

  it('parses a Python source file into a syntax tree', async () => {
    const python = treeSitterDefinitions.find((definition) => definition.id === 'python');
    expect(python).toBeDefined();

    const parser = await getParserInstance();
    const language = await loadTreeSitterLanguage(python!);
    expect(language).not.toBeNull();

    parser.setLanguage(language);
    const tree = parser.parse('def greet(name):\n    return name\n');

    expect(tree).not.toBeNull();
    expect(tree!.rootNode.hasError).toBe(false);
    expect(tree!.rootNode.type).toBe('module');
  });
});
