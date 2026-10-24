/**
 * Finds commented-out code: several consecutive comment lines that read as code rather than
 * prose. The heuristics favour precision, because a false alarm on prose is worse than a miss.
 */
import { commentLines, type SourceComment } from './comments';
import { isStructuredDoc } from './conventions';
import { COMMENTED_CODE_MIN_LINES, COMMENTED_CODE_MIN_RATIO } from './policy';
import type { LineRange } from './types';

// Each pattern needs real code punctuation, so a sentence that starts with a keyword is not code.
const CODE_LINE_PATTERNS: RegExp[] = [
  /[;{]\s*$/,
  /^\s*[})\]]+[;,)]*\s*$/,
  /^\s*(if|while|for|switch|catch)\s*\(.*\)/,
  // Python and Ruby style blocks.
  /^\s*(else|try|finally)\s*:\s*$/,
  /^\s*(def|class)\s+\w+.*:\s*$/,
  /^\s*except\b.*:\s*$/,
  /^\s*(if|elif|while)\s+.*[=<>!].*:\s*$/,
  /^\s*for\s+\w+\s+in\s+.*:\s*$/,
  /^\s*(if|unless|elsif|while|until)\s+\S+.*\s[=<>!]=?\s/,
  /^\s*(end|fi|done|esac)\s*$/,
  /^\s*[\w$.]+(\s*,\s*[\w$.]+)*\s*:=\s*\S/,
  /(;|^)\s*(then|do)\s*$/,
  /^\s*(const|let|var|final|val)\s+[\w$]+\s*[:=]/,
  /^\s*(def|fn|func|function|class|struct|impl|interface)\s+[\w$]+/,
  /^\s*(return|throw)\b.*[;)\]]\s*$/,
  /^\s*(import|from|using|use)\s+[\w.{}*]+.*(;|\bimport\b|\bfrom\b)/,
  /^\s*[\w$.]+(\[[^\]]*\])?\s*[-+*/|&]?=\s*[^=\s]/,
  /^\s*(await\s+)?[\w$.]+\([^()]*\)\s*;?\s*$/,
  /^\s*(console|print|println|echo|puts)\b[.\s(]/,
];

const isCodeLine = (line: string): boolean => CODE_LINE_PATTERNS.some((p) => p.test(line));

interface NumberedLine {
  line: number;
  text: string;
}

/** The lines of every plain comment, numbered by their place in the file. */
const plainCommentLines = (comments: SourceComment[]): NumberedLine[] =>
  comments
    .filter((comment) => comment.standalone && !isStructuredDoc(comment))
    .flatMap((comment) =>
      commentLines(comment.text).map((text, offset) => ({ line: comment.startLine + offset, text }))
    )
    .sort((a, b) => a.line - b.line);

/** Splits numbered lines into runs of consecutive line numbers. */
const consecutiveRuns = (lines: NumberedLine[]): NumberedLine[][] => {
  const runs: NumberedLine[][] = [];
  for (const entry of lines) {
    const run = runs[runs.length - 1];
    if (run && run[run.length - 1].line + 1 === entry.line) run.push(entry);
    else runs.push([entry]);
  }
  return runs;
};

/** The range of code lines of a run, or null when the run reads as prose. */
const codeRange = (run: NumberedLine[]): LineRange | null => {
  const filled = run.filter((entry) => entry.text.trim() !== '');
  const code = filled.filter((entry) => isCodeLine(entry.text));
  if (filled.length < COMMENTED_CODE_MIN_LINES) return null;
  if (code.length / filled.length < COMMENTED_CODE_MIN_RATIO) return null;
  return { startLine: code[0].line, endLine: code[code.length - 1].line };
};

/** Runs of comment lines that look like disabled code, in source order. */
export const findCommentedOutCode = (comments: SourceComment[]): LineRange[] =>
  consecutiveRuns(plainCommentLines(comments))
    .map(codeRange)
    .filter((range): range is LineRange => range !== null);
