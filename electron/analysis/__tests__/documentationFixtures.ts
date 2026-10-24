/**
 * Hand-made documentation results for tests of the consumers of the report (health score,
 * validation, tool output), which should not depend on the parsers.
 */
import {
  buildDocumentationReport,
  type DocumentationReport,
  type FileDocumentation,
  type SymbolDocumentation,
} from '../documentation';

/** A required exported function that is documented or not. */
export const symbol = (
  name: string,
  documented: boolean,
  overrides: Partial<SymbolDocumentation> = {}
): SymbolDocumentation => ({
  name,
  kind: 'function',
  line: 10,
  exported: true,
  required: true,
  documented,
  quality: 'ok',
  ...overrides,
});

/** A measured file with the given symbols. */
export const docFile = (
  file: string,
  symbols: SymbolDocumentation[],
  overrides: Partial<FileDocumentation> = {}
): FileDocumentation => ({
  file,
  language: 'typescript',
  exempt: false,
  header: 'documented',
  symbols,
  commentedOutCode: [],
  unownedTodos: [],
  ...overrides,
});

/** A project report built from the files. */
export const reportOf = (...files: FileDocumentation[]): DocumentationReport =>
  buildDocumentationReport(files);
