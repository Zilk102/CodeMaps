/**
 * The shape every declaration collector produces, whichever parser it runs on. The file analysis
 * works on these records only, so a language is supported by teaching a collector to emit them.
 */
import type { SymbolKind } from './types';

/** A declaration found in a file, before its documentation is looked up. */
export interface RawDeclaration {
  name: string;
  kind: SymbolKind;
  /** 1-based line the declaration starts on. */
  line: number;
  /** 1-based last line of the declaration. */
  endLine: number;
  /** The line the leading doc comment must end just above (decorators and attributes included). */
  anchorLine: number;
  exported: boolean;
  /** Never required: `override` methods, trait implementations, out-of-line definitions. */
  exempt: boolean;
  /**
   * Only for docstring languages: the docstring text, or null when there is none.
   * Undefined means the documentation is a comment above the declaration.
   */
  docstring?: string | null;
}

/** What a collector found in one file. */
export interface DeclarationScan {
  declarations: RawDeclaration[];
  /** Only for docstring languages: the module docstring, or null when there is none. */
  moduleDocstring?: string | null;
}
