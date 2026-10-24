// Shared shapes of the parsing layer: what a parse returns, how languages are described and how
// adapters plug in.

/** Kind of declaration the parser reports. */
export type EntityType = 'class' | 'function';
/**
 * Backend that parses a language: tree-sitter queries, the Markdown ADR reader, or the TypeScript
 * compiler API.
 */
export type ParserEngine = 'tree-sitter' | 'markdown-adr' | 'typescript-semantic';
/**
 * How much a language yields: `semantic` (compiler-grade, TS/JS), `structural` (tree-sitter
 * declarations, imports and calls), `limited` (markup and styles) or `metadata` (config and docs).
 */
export type LanguageSupportTier = 'semantic' | 'structural' | 'limited' | 'metadata';
/** Identifier of a language adapter; there is one per parser engine. */
export type LanguageAdapterId =
  'tree-sitter-query-adapter' | 'markdown-adr-adapter' | 'typescript-semantic-adapter';

/**
 * An import statement of a file. `path` is the specifier as written; `resolvedPath` is filled in
 * later, once the project files are known.
 */
export interface ImportRecord {
  path: string;
  importedEntities: string[];
  resolvedPath?: string;
  /** `import x as y` / Go package alias; '.' and '_' are kept verbatim for Go. */
  alias?: string;
  /**
   * Language-specific flavour of the import: `system` for `<angle>` C includes, `relative` for
   * Ruby `require_relative`, `static` for `using static`, `namespace` for a C# namespace using,
   * `function` / `const` for PHP `use function`, `file` for PHP `require`.
   */
  kind?: string;
}

/** `pkg.Name` / `module::name`: a name used through a qualifier that an import may have introduced. */
export interface QualifiedUse {
  qualifier: string;
  name: string;
}

/**
 * Per-file facts that only make sense once the whole project is known: the language's import
 * statements, which names the file uses and which package it declares. The graph resolves
 * them to files after indexing, because a Go, Python, Java or Rust import names a package or
 * module, not a relative path.
 */
export interface FileResolutionFacts {
  imports: ImportRecord[];
  qualifiedUses: QualifiedUse[];
  /** Unqualified identifiers that may refer to a symbol declared in another file. */
  usedNames: string[];
  packageName?: string;
  /** Every namespace the file declares (C# allows several per file); `packageName` is the first. */
  namespaces?: string[];
  /** Rust `mod name;` declarations: child module files owned by this file. */
  moduleDeclarations?: string[];
}

/** `export * from './x'` / `export { a } from './x'`: names that a barrel file forwards. */
export interface ReExportRecord {
  path: string;
  resolvedPath?: string;
  /** Original names in the target module, or '*' for every export. */
  entities: string[];
}

/**
 * A class-like or function-like declaration of a file, with its position when the parser provides
 * one.
 */
export interface EntityRecord {
  type: EntityType;
  name: string;
  location?: SourceLocation;
}

/** Source range of a declaration; lines and columns are as reported by the parser. */
export interface SourceLocation {
  startLine: number;
  startColumn: number;
  endLine: number;
  endColumn: number;
}

/**
 * A name a file exports. `localName` is set when it differs from `exportedName` (`export { a as b
 * }`).
 */
export interface ExportRecord {
  exportedName: string;
  localName?: string;
  isDefault?: boolean;
}

/**
 * Everything extracted from one file. `sizeExceeded` means the file was too large and nothing else
 * was read; an unsupported or unreadable file yields the same empty result.
 */
export interface ParseResult {
  sizeExceeded: boolean;
  imports: ImportRecord[];
  entities: EntityRecord[];
  exports: ExportRecord[];
  reExports?: ReExportRecord[];
  resolution?: FileResolutionFacts;
  adr?: string;
  isMarkdownADR?: boolean;
  variables: string[];
  calls: string[];
  comments: string[];
  detectedLanguage?: string;
}

/** Input of a language adapter: one file's text plus the language definition it was matched to. */
export interface ParseContext {
  filePath: string;
  text: string;
  definition: LanguageDefinition;
  adr?: string;
  baseDir?: string;
}

/**
 * Which kinds of facts a language can produce; a false flag means the field stays empty rather than
 * that the file has none.
 */
export interface LanguageCapabilities {
  entities: boolean;
  imports: boolean;
  variables: boolean;
  calls: boolean;
  comments: boolean;
}

/**
 * Static description of a supported language: how to find its files (`extensions`), which adapter
 * and engine parse it, and its grammar and query.
 */
export interface LanguageDefinition {
  id: string;
  displayName: string;
  adapterId: LanguageAdapterId;
  parserEngine: ParserEngine;
  supportTier: LanguageSupportTier;
  wasmName?: string;
  extensions: string[];
  query?: string;
  capabilities: LanguageCapabilities;
}

/** Languages found in a project, most common first, with the number of files of each. */
export interface ProjectLanguageProfile {
  activeLanguageIds: string[];
  languageFileCounts: Record<string, number>;
}

/**
 * Request to parse one file. When `activeLanguageIds` is non-empty, files of other languages are
 * skipped.
 */
export interface ParseWorkerInput {
  filePath: string;
  activeLanguageIds?: string[];
  baseDir?: string;
}

/**
 * Parser backend for a family of languages. `supports` says whether it can handle a definition and
 * `parse` turns a file into a `ParseResult`.
 */
export interface LanguageAdapter {
  id: LanguageAdapterId;
  parserEngines: ParserEngine[];
  supportTiers?: LanguageSupportTier[];
  supports: (definition: LanguageDefinition) => boolean;
  parse: (context: ParseContext) => Promise<ParseResult>;
}
