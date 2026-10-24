/**
 * Judges the text of a doc comment: is it long enough to say something, and does it say more than
 * the name of the symbol it sits on? Pure word arithmetic; no network, no language model.
 */
import { ECHO_EXTRA_WORD_RATIO, ECHO_MIN_COMMENT_WORDS, MIN_DOC_WORDS } from './policy';
import type { DocQuality } from './types';

const WORD = /[\p{L}][\p{L}\p{N}']*/gu;
const TAG = /@\w+/g;

// Filler that carries no meaning when comparing a comment with a name.
const STOP_WORDS = new Set([
  'a',
  'an',
  'the',
  'of',
  'for',
  'to',
  'this',
  'that',
  'is',
  'are',
  'be',
  'it',
  'its',
  'and',
  'or',
  'in',
  'on',
  'with',
  'from',
  'by',
  'as',
  'given',
  'current',
  'specified',
]);

// Verbs that describe the same act, so `Returns the user` echoes `getUser`. Keys and values are
// already stems (see `stem`): no final `e`.
const SYNONYMS = new Map([
  ['return', 'get'],
  ['fetch', 'get'],
  ['retriev', 'get'],
  ['obtain', 'get'],
  ['updat', 'set'],
  ['assign', 'set'],
  ['build', 'creat'],
  ['mak', 'creat'],
  ['construct', 'creat'],
  ['new', 'creat'],
]);

const SUFFIXES = ['ing', 'ed', 'es', 's'];

/**
 * Lower-cases a word and cuts the common verb and plural endings and a final `e`, so `parses`,
 * `parsed` and `parse` all give `pars`.
 */
const stem = (word: string): string => {
  const lower = word.toLowerCase();
  const suffix = SUFFIXES.find((ending) => lower.length > 3 && lower.endsWith(ending));
  const cut = suffix ? lower.slice(0, -suffix.length) : lower;
  const base = cut.length > 3 && cut.endsWith('e') ? cut.slice(0, -1) : cut;
  return SYNONYMS.get(base) ?? base;
};

/** The words of an identifier: `getUserByID` gives get, user, by, id. */
export const nameWords = (name: string): string[] =>
  name
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2')
    .split(/[^\p{L}\p{N}]+/u)
    .filter(Boolean);

/** Words of a doc text, without `@param`-style tag names. */
export const docWords = (text: string): string[] => text.replace(TAG, ' ').match(WORD) ?? [];

/** The first paragraph of a doc text, up to a blank line or the first `@tag` line. */
const summaryOf = (text: string): string => {
  const lines: string[] = [];
  for (const line of text.split('\n')) {
    if (line.trim() === '' && lines.length > 0) break;
    if (line.trim().startsWith('@')) break;
    lines.push(line);
  }
  return lines.join(' ');
};

/** Whether the summary of a doc text only restates the name. */
const isEcho = (name: string, text: string): boolean => {
  const nameSet = new Set(nameWords(name).map(stem));
  const content = docWords(summaryOf(text))
    .filter((word) => !STOP_WORDS.has(word.toLowerCase()))
    .map(stem);
  if (content.length < ECHO_MIN_COMMENT_WORDS) return false;
  const extra = content.filter((word) => !nameSet.has(word));
  return extra.length / content.length <= ECHO_EXTRA_WORD_RATIO;
};

/** Rates the doc text of a symbol: too short, an echo of the name, or fine. */
export const assessDocQuality = (name: string, text: string): DocQuality => {
  if (docWords(text).length < MIN_DOC_WORDS) return 'too_short';
  return isEcho(name, text) ? 'echo' : 'ok';
};
