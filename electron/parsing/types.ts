export type EntityType = 'class' | 'function';
export type ParserEngine = 'tree-sitter' | 'markdown-adr' | 'typescript-semantic';

export interface ImportRecord {
  path: string;
  importedEntities: string[];
  resolvedPath?: string;
}

export interface EntityRecord {
  type: EntityType;
  name: string;
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
  parserEngine: ParserEngine;
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
