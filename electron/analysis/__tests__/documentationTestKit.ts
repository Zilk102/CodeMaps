import {
  analyzeDocumentationSource,
  type FileDocumentation,
  type SymbolDocumentation,
} from '../documentation';

/** Joins lines into a source text. */
export const source = (...lines: string[]): string => lines.join('\n');

/** `count` lines made by a template, for bodies that must be long enough to need documentation. */
export const repeatLines = (count: number, make: (index: number) => string): string[] =>
  Array.from({ length: count }, (_, index) => make(index));

/** Analyzes a source text as if it lived in `file`; fails the test when the language is skipped. */
export const analyze = async (file: string, text: string): Promise<FileDocumentation> => {
  const result = await analyzeDocumentationSource(file, text);
  if (!result) throw new Error(`${file} was not analyzed`);
  return result;
};

/** The symbol with this name; fails the test when it was not found. */
export const symbolNamed = (result: FileDocumentation, name: string): SymbolDocumentation => {
  const found = result.symbols.find((symbol) => symbol.name === name);
  if (!found) throw new Error(`no symbol ${name} in ${result.symbols.map((s) => s.name)}`);
  return found;
};

/**
 * One short code per symbol: `name:kind:` then E (exported), R (required), D (documented), with
 * `-` for the flags that are off. Lets a test state a whole file's verdict in one array.
 */
export const verdicts = (result: FileDocumentation): string[] =>
  result.symbols.map(
    (s) =>
      `${s.name}:${s.kind}:${s.exported ? 'E' : '-'}${s.required ? 'R' : '-'}${s.documented ? 'D' : '-'}`
  );
