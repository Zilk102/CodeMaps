// Scans source text for matching braces while skipping comments and string literals.

/**
 * Index of the first `{` at or after `startIndex`, or -1. Plain character search: comments and
 * strings are not skipped.
 */
export function findNextOpenBrace(text: string, startIndex: number): number {
  for (let index = startIndex; index < text.length; index += 1) {
    if (text[index] === '{') {
      return index;
    }
  }
  return -1;
}

type ScanMode = 'code' | 'lineComment' | 'blockComment' | 'single' | 'double' | 'template';

const QUOTE_MODES: Record<string, ScanMode> = { "'": 'single', '"': 'double', '`': 'template' };
const QUOTE_CHARS: Partial<Record<ScanMode, string>> = {
  single: "'",
  double: '"',
  template: '`',
};

/** Whether `char` (preceded by `prevChar`) ends the non-code region `mode`. */
function endsScanMode(mode: ScanMode, char: string, prevChar: string | undefined): boolean {
  if (mode === 'lineComment') return char === '\n';
  if (mode === 'blockComment') return prevChar === '*' && char === '/';
  return char === QUOTE_CHARS[mode] && prevChar !== '\\';
}

/** The non-code region started at `char`, with how many extra characters it consumes. */
function startsScanMode(
  char: string,
  nextChar: string | undefined
): { mode: ScanMode; skip: number } | null {
  if (char === '/' && nextChar === '/') return { mode: 'lineComment', skip: 1 };
  if (char === '/' && nextChar === '*') return { mode: 'blockComment', skip: 1 };
  const quoteMode = QUOTE_MODES[char];
  return quoteMode ? { mode: quoteMode, skip: 0 } : null;
}

const BRACE_DELTA: Record<string, number> = { '{': 1, '}': -1 };

/**
 * Index of the `}` that closes the `{` at `openBraceIndex`, or -1 when the text ends first. Braces
 * inside comments and string or template literals are ignored; a regular-expression literal
 * containing a quote or brace can still confuse it.
 */
export function findMatchingBrace(text: string, openBraceIndex: number): number {
  let depth = 0;
  let mode: ScanMode = 'code';

  for (let index = openBraceIndex; index < text.length; index += 1) {
    const char = text[index];

    if (mode !== 'code') {
      if (endsScanMode(mode, char, text[index - 1])) {
        mode = 'code';
      }
      continue;
    }

    const started = startsScanMode(char, text[index + 1]);
    if (started) {
      mode = started.mode;
      index += started.skip;
      continue;
    }
    depth += BRACE_DELTA[char] ?? 0;
    if (char === '}' && depth === 0) return index;
  }

  return -1;
}

/**
 * Number of lines spanned by `text[start, end)`, counting a partial first and last line each as
 * one.
 */
export function getLineCountForRange(text: string, start: number, end: number): number {
  return text.slice(start, end).split(/\r?\n/u).length;
}

/** True when `index` lies inside any of the inclusive ranges. */
export function isInsideRanges(
  index: number,
  ranges: Array<{ start: number; end: number }>
): boolean {
  return ranges.some((range) => index >= range.start && index <= range.end);
}
