export type SymbolKind = 'function' | 'class' | 'type' | 'const';

/** One declaration of a file with the other declarations of the same file it refers to. */
export interface SymbolInfo {
  /** Unique within the file; methods are qualified (`Handler.Get`, `Foo::new`). */
  name: string;
  kind: SymbolKind;
  startLine: number;
  endLine: number;
  /** Lines the symbol owns itself (a class shell does not count its methods). */
  lineCount: number;
  /** Names of other symbols of the same file used inside the declaration. */
  refs: string[];
}

export interface SymbolGraph {
  filePath: string;
  language: string;
  lineCount: number;
  symbols: SymbolInfo[];
}

export interface PlannedSymbol {
  name: string;
  kind: SymbolKind;
  lines: number;
}

export interface SplitCluster {
  /** What the cluster is about, e.g. `auth` or `admin_users`. */
  name: string;
  suggestedFile: string;
  symbolCount: number;
  lineCount: number;
  symbols: PlannedSymbol[];
  omittedSymbols: number;
  /** Shared helpers and types of the file this cluster calls (they stay behind or move to a shared file). */
  needsHelpers: string[];
  /** Other clusters it calls into. */
  dependsOn: string[];
}

export interface SplitPlan {
  file: string;
  language: string;
  lineCount: number;
  symbolCount: number;
  /** How cleanly the symbols fall apart: share of references that stay inside a cluster. */
  confidence: 'high' | 'medium' | 'low';
  cohesion: number;
  /** Share of the file's lines that belong to a declaration (the rest is imports, comments, blank lines). */
  coverage: number;
  /** Declarations used by many clusters: keep them in the original file or move them to a shared one. */
  sharedHelpers: Array<{ name: string; kind: SymbolKind; usedBy: number; lines: number }>;
  /** The largest declarations; one huge constant or function is often the whole problem. */
  heaviest: Array<{ name: string; kind: SymbolKind; lines: number }>;
  /** Symbols that call a large part of the file (route tables, mains): keep them where they are. */
  orchestrators: string[];
  clusters: SplitCluster[];
  note: string;
}
