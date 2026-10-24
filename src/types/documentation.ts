/**
 * Renderer-side shape of the documentation report returned by the `check-documentation` IPC
 * call; mirrors `DocumentationToolReport` of the main process, which the renderer cannot import.
 */

/** The kind of declaration a symbol is. */
export type DocumentationSymbolKind =
  'class' | 'interface' | 'struct' | 'enum' | 'trait' | 'type' | 'function' | 'method';

/** A public symbol without a doc comment, or with one that says nothing. */
export interface DocumentationSymbolItem {
  file: string;
  line: number;
  name: string;
  kind: DocumentationSymbolKind;
  /** What the comment of this symbol must state. */
  hint: string;
}

/** A file with undocumented symbols. */
export interface DocumentationOffenderItem {
  file: string;
  missing: number;
  required: number;
  coverage: number;
}

/** Coverage of one language. */
export interface DocumentationLanguageItem {
  language: string;
  files: number;
  requiredSymbols: number;
  documentedSymbols: number;
  coverage: number;
  filesWithoutHeader: number;
}

/** A bounded list: the shown items and how many exist in total. */
export interface DocumentationList<T> {
  total: number;
  omitted: number;
  items: T[];
}

/** The documentation coverage of the open project. */
export interface DocumentationReportData {
  coveragePercent: number;
  requiredSymbols: number;
  documentedSymbols: number;
  analyzedFiles: number;
  exemptFiles: number;
  commentedOutCodeBlocks: number;
  byLanguage: DocumentationLanguageItem[];
  topOffenders: DocumentationOffenderItem[];
  filesWithoutHeader: { total: number; files: string[]; hint: string };
  undocumented: DocumentationList<DocumentationSymbolItem>;
  lowQuality?: DocumentationList<DocumentationSymbolItem & { quality: 'echo' | 'too_short' }>;
  guidance: string;
}

/** The IPC answer: the report or the reason the analysis failed. */
export type DocumentationResponse =
  { success: true; data: DocumentationReportData } | { success: false; error: string };
