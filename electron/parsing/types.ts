export type EntityType = 'class' | 'function';
export type ParserEngine = 'tree-sitter' | 'markdown-adr' | 'typescript-semantic';
export type LanguageSupportTier = 'semantic' | 'structural' | 'limited' | 'metadata';
export type LanguageAdapterId =
  | 'tree-sitter-query-adapter'
  | 'markdown-adr-adapter'
  | 'typescript-semantic-adapter';

export interface ImportRecord {
  path: string;
  importedEntities: string[];
  resolvedPath?: string;
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
