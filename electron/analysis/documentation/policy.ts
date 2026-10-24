/**
 * The documentation policy: every number that decides what must be documented and what counts
 * as a useful comment. Tune the engine here; no other module hard-codes these values.
 */
import type { SymbolKind } from './types';

/** Files with fewer lines than this do not need a header comment. */
export const MIN_HEADER_FILE_LINES = 15;
/** A private function or method of at least this many lines must be documented. */
export const MIN_PRIVATE_DOC_LINES = 10;
/** A doc comment with fewer words than this is reported as too short. */
export const MIN_DOC_WORDS = 3;
/** A header comment must also have this many words, or banners like `// ----` would count. */
export const MIN_HEADER_WORDS = 3;
/** A header comment must start within this many lines of the top of the file. */
export const HEADER_MAX_START_LINE = 40;

/** A doc comment is an echo when at most this share of its words is not in the symbol name. */
export const ECHO_EXTRA_WORD_RATIO = 0.25;
/** At least this many comment words are needed before the echo test applies. */
export const ECHO_MIN_COMMENT_WORDS = 1;

/** Fewer consecutive comment lines than this are never commented-out code. */
export const COMMENTED_CODE_MIN_LINES = 3;
/** Share of the lines in a comment run that must look like code to flag the run. */
export const COMMENTED_CODE_MIN_RATIO = 0.6;

/** Files larger than this are skipped, like in the clone detector. */
export const MAX_FILE_BYTES = 400_000;
/** At most this many files are analyzed per project. */
export const MAX_ANALYZED_FILES = 4000;
/** Files read in parallel. */
export const READ_CONCURRENCY = 16;
/** Parsing is CPU work on the main thread: give the event loop a turn every few files. */
export const YIELD_EVERY = 15;
/** The top offenders list holds at most this many files. */
export const MAX_TOP_OFFENDERS = 25;

/** The facts the policy needs to decide whether a symbol must be documented. */
export interface RequirementInput {
  kind: SymbolKind;
  exported: boolean;
  /** Declared with `override`, implements a trait, ...: the docs live on the original. */
  exempt: boolean;
  /** Number of lines of the declaration. */
  lineCount: number;
}

/** Whether the policy demands a doc comment for a symbol. */
export const isDocumentationRequired = (input: RequirementInput): boolean => {
  if (input.exempt) return false;
  if (input.exported) return true;
  const isFunction = input.kind === 'function' || input.kind === 'method';
  return isFunction && input.lineCount >= MIN_PRIVATE_DOC_LINES;
};

/** Whether a file of this length must open with a header comment. */
export const isHeaderRequired = (lineCount: number): boolean => lineCount >= MIN_HEADER_FILE_LINES;
