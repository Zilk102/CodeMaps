// Scans source text for matching braces while skipping comments and string literals.

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

export function getLineCountForRange(text: string, start: number, end: number): number {
  return text.slice(start, end).split(/\r?\n/u).length;
}

export function isInsideRanges(
  index: number,
  ranges: Array<{ start: number; end: number }>
): boolean {
  return ranges.some((range) => index >= range.start && index <= range.end);
}
