/**
 * Public types of the documentation coverage engine.
 *
 * The engine measures how well code is documented: which declarations need a doc comment, which
 * have one, and whether the comments say anything. See `index.ts` for the entry points.
 */

/** The kind of declaration that can carry documentation (the file header is reported apart). */
export type SymbolKind =
  'class' | 'interface' | 'struct' | 'enum' | 'trait' | 'type' | 'function' | 'method';

/**
 * How useful the documentation of a symbol is.
 * `echo` restates the symbol name, `too_short` has fewer words than the policy asks for.
 */
export type DocQuality = 'ok' | 'echo' | 'too_short';

/** Whether a file opens with a header comment (`n/a` when the file is exempt or too short). */
export type HeaderStatus = 'documented' | 'missing' | 'n/a';

/** Why a file is left out of the measurement. */
export type ExemptReason = 'test' | 'generated';

/** A declaration of a file with the verdict on its documentation. */
export interface SymbolDocumentation {
  name: string;
  kind: SymbolKind;
  /** 1-based line the declaration starts on. */
  line: number;
  /** Visible outside its file or class: `export`, `pub`, `public`, a capitalized Go name, ... */
  exported: boolean;
  /** Whether the policy demands documentation for this symbol. */
  required: boolean;
  documented: boolean;
  quality: DocQuality;
}

/** A 1-based inclusive range of lines. */
export interface LineRange {
  startLine: number;
  endLine: number;
}

/** A TODO, FIXME or HACK marker that names neither an owner nor an issue. Informational only. */
export interface UnownedTodo {
  line: number;
  tag: string;
}

/** Everything the engine learned about one file. */
export interface FileDocumentation {
  /** The path as it was given to the analyzer. */
  file: string;
  /** Language id from the language catalog, for example `typescript` or `c_sharp`. */
  language: string;
  /** Exempt files (tests, generated code) have no symbols and no header verdict. */
  exempt: boolean;
  exemptReason?: ExemptReason;
  header: HeaderStatus;
  symbols: SymbolDocumentation[];
  /** Runs of comment lines that look like disabled code. */
  commentedOutCode: LineRange[];
  unownedTodos: UnownedTodo[];
}

/** A required symbol that has no documentation, for gates and to-do lists. */
export interface UndocumentedSymbol {
  file: string;
  line: number;
  name: string;
  kind: SymbolKind;
}

/** A documented symbol whose comment adds nothing. */
export interface LowQualityDoc {
  file: string;
  line: number;
  name: string;
  kind: SymbolKind;
  quality: Exclude<DocQuality, 'ok'>;
}

/** A file that misses documentation, as listed in the top offenders. */
export interface DocumentationOffender {
  file: string;
  missing: number;
  required: number;
  /** Percent of the required symbols that are documented, 0-100. */
  coverage: number;
}

/** Coverage of one language. */
export interface LanguageDocumentationStats {
  language: string;
  files: number;
  requiredSymbols: number;
  documentedSymbols: number;
  /** Percent, 0-100; 100 when nothing is required. */
  coverage: number;
  filesWithoutHeader: number;
}

/** The documentation state of a whole project. */
export interface DocumentationReport {
  /** Files that were measured (not exempt). */
  analyzedFiles: number;
  exemptFiles: number;
  requiredSymbols: number;
  documentedSymbols: number;
  /** Percent of the required symbols that are documented, 0-100; 100 when nothing is required. */
  coveragePercent: number;
  /** Files of at least the policy's minimum length that open without a header comment. */
  filesWithoutHeader: string[];
  /** Files with the most undocumented required symbols first, at most the policy's limit. */
  topOffenders: DocumentationOffender[];
  byLanguage: LanguageDocumentationStats[];
  /** Every undocumented required symbol, sorted by file, line and name. */
  undocumented: UndocumentedSymbol[];
  /** Documented symbols whose comment only echoes the name or is too short. */
  lowQuality: LowQualityDoc[];
  commentedOutCodeBlocks: number;
  /** The per-file facts the report was built from, sorted by path. */
  files: FileDocumentation[];
}
