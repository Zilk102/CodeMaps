/**
 * The documentation conventions of every supported language: which parser reads it and which
 * comment shapes count as documentation. Markdown, HTML, CSS, YAML and JSON are not listed
 * because they hold no declarations to document.
 */
import { getLanguageByExtension } from '../../parsing/languageRegistry';
import { SourceComment } from './comments';

/** Which parser reads the declarations of a language. */
export type DocEngine = 'typescript' | 'vue' | 'tree-sitter';

/** How a language marks documentation. */
export interface DocConvention {
  engine: DocEngine;
  /** A comment matching this directly above a declaration documents it. */
  marker: RegExp;
  /** When set, only comments matching this can be the file header (Rust and Zig `//!`). */
  headerMarker?: RegExp;
  /** Python: the documentation is the first string of the body, not a comment. */
  docstring?: boolean;
}

const JSDOC = /^\/\*\*(?![*/])/;
const TRIPLE_SLASH_OR_DOC = /^(\/\/\/(?!\/)|\/\*\*(?![*/]))/;
// Go, Ruby and Bash document with any plain comment block; directives are not documentation.
const PLAIN_COMMENT =
  /^(\/\/|#)(?!!)(?!\s*(go:|nolint|rubocop|frozen_string_literal|encoding|coding|-\*-|typed:|shellcheck|lint:))/i;

const CONVENTIONS: Record<string, DocConvention> = {
  javascript: { engine: 'typescript', marker: JSDOC },
  typescript: { engine: 'typescript', marker: JSDOC },
  tsx: { engine: 'typescript', marker: JSDOC },
  vue: { engine: 'vue', marker: JSDOC },
  python: { engine: 'tree-sitter', marker: /^$/, docstring: true },
  go: { engine: 'tree-sitter', marker: PLAIN_COMMENT },
  rust: {
    engine: 'tree-sitter',
    marker: TRIPLE_SLASH_OR_DOC,
    headerMarker: /^(\/\/!|\/\*!)/,
  },
  java: { engine: 'tree-sitter', marker: JSDOC },
  kotlin: { engine: 'tree-sitter', marker: JSDOC },
  php: { engine: 'tree-sitter', marker: JSDOC },
  cpp: { engine: 'tree-sitter', marker: /^(\/\/[/!]|\/\*[*!])(?![*/])/ },
  c_sharp: { engine: 'tree-sitter', marker: /^\/\/\/(?!\/)/ },
  ruby: { engine: 'tree-sitter', marker: PLAIN_COMMENT },
  zig: { engine: 'tree-sitter', marker: /^\/\/\/(?!\/)/, headerMarker: /^\/\/!/ },
  swift: { engine: 'tree-sitter', marker: TRIPLE_SLASH_OR_DOC },
  bash: { engine: 'tree-sitter', marker: PLAIN_COMMENT },
};

/** The language id and convention of a file, or null for languages that are not measured. */
export const conventionForFile = (
  extension: string
): { language: string; convention: DocConvention } | null => {
  const definition = getLanguageByExtension(extension);
  const convention = definition ? CONVENTIONS[definition.id] : undefined;
  return definition && convention ? { language: definition.id, convention } : null;
};

/** Whether the convention treats a comment as documentation. */
export const isDocComment = (convention: DocConvention, comment: SourceComment): boolean =>
  convention.marker.test(comment.text);

/** Comments that open with these markers are documentation, never commented-out code. */
const STRUCTURED_DOC = /^(\/\*[*!]|\/\/[/!])/;

/** Whether a comment is a documentation comment in any language (for commented-out code). */
export const isStructuredDoc = (comment: SourceComment): boolean =>
  STRUCTURED_DOC.test(comment.text);
