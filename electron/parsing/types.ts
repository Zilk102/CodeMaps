export type EntityType = 'class' | 'function';
export type ParserEngine = 'tree-sitter' | 'markdown-adr' | 'typescript-semantic';
export type LanguageSupportTier = 'semantic' | 'structural' | 'limited' | 'metadata';
export type LanguageAdapterId =
  'tree-sitter-query-adapter' | 'markdown-adr-adapter' | 'typescript-semantic-adapter';

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

export interface EntityRecord {
  type: EntityType;
  name: string;
  location?: SourceLocation;
}

export interface SourceLocation {
  startLine: number;
  startColumn: number;
  endLine: number;
  endColumn: number;
}

export interface ExportRecord {
  exportedName: string;
  localName?: string;
  isDefault?: boolean;
}

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

export interface ParseContext {
  filePath: string;
  text: string;
  definition: LanguageDefinition;
  adr?: string;
  baseDir?: string;
}

export interface LanguageCapabilities {
  entities: boolean;
  imports: boolean;
  variables: boolean;
  calls: boolean;
  comments: boolean;
}

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

export interface ProjectLanguageProfile {
  activeLanguageIds: string[];
  languageFileCounts: Record<string, number>;
}

export interface ParseWorkerInput {
  filePath: string;
  activeLanguageIds?: string[];
  baseDir?: string;
}

export interface LanguageAdapter {
  id: LanguageAdapterId;
  parserEngines: ParserEngine[];
  supportTiers?: LanguageSupportTier[];
  supports: (definition: LanguageDefinition) => boolean;
  parse: (context: ParseContext) => Promise<ParseResult>;
}
