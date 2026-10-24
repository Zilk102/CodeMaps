/**
 * Version markers that make `setup_project` safe to repeat. Shared files (AGENTS.md, CLAUDE.md,
 * ...) get one block between `<!-- codemaps:start vX.Y.Z -->` and `<!-- codemaps:end -->`;
 * standalone files CodeMaps owns carry a `codemaps:file vX.Y.Z` marker. Only text inside a marker
 * is ever rewritten, and only when the marker is older than the running CodeMaps (or `force`).
 */

/** Closing line of a shared-file block. */
export const BLOCK_END = '<!-- codemaps:end -->';

/** Placeholder in owned-file templates that is replaced by the file marker line. */
export const FILE_MARKER_TOKEN = '{{CODEMAPS_FILE_MARKER}}';

const BLOCK_START_PATTERN = /<!--\s*codemaps:start(?:\s+v([0-9][\w.+-]*))?\s*-->/;
const FILE_MARKER_PATTERN = /codemaps:file v([0-9][\w.+-]*)/;

/** Opening line of a shared-file block for `version`. */
export const blockStart = (version: string): string => `<!-- codemaps:start v${version} -->`;

/** Marker line of an owned file in the comment style of its format. */
export const fileMarker = (version: string, style: 'html' | 'slash' | 'hash'): string => {
  const text = `codemaps:file v${version}`;
  if (style === 'html') return `<!-- ${text} -->`;
  return style === 'slash' ? `// ${text}` : `# ${text}`;
};

/**
 * Orders two dotted versions numerically: negative when `a` is older than `b`, zero when equal.
 * Non-numeric suffixes (`-beta`) are ignored, so `1.2.0-beta` equals `1.2.0`.
 */
export const compareVersions = (a: string, b: string): number => {
  const left = a
    .split(/[^0-9]+/)
    .filter(Boolean)
    .map(Number);
  const right = b
    .split(/[^0-9]+/)
    .filter(Boolean)
    .map(Number);
  for (let index = 0; index < Math.max(left.length, right.length); index++) {
    const difference = (left[index] ?? 0) - (right[index] ?? 0);
    if (difference !== 0) return difference;
  }
  return 0;
};

/** What happened to a text a marker governs. */
export type MarkerOutcome =
  'created' | 'appended' | 'replaced' | 'unchanged' | 'newer' | 'foreign' | 'malformed';

/** The new text of a file (when it changes) and why. */
export interface MarkerResult {
  outcome: MarkerOutcome;
  /** Full new file text; undefined when the file must stay as it is. */
  text?: string;
  /** Version found in the existing marker, when there was one. */
  previousVersion?: string;
}

const detectEol = (text: string): string => (text.includes('\r\n') ? '\r\n' : '\n');

const withEol = (text: string, eol: string): string => text.replace(/\r?\n/g, eol);

/** Decides, from the version already in a file and the one being written, whether to rewrite. */
const shouldRewrite = (found: string, version: string, force: boolean): boolean =>
  force || compareVersions(found, version) < 0;

/** The result when an existing marker is left alone: a newer version is reported, an equal or stale-but-current one counts as unchanged. */
const keepOutcome = (found: string, version: string): MarkerResult => ({
  outcome: compareVersions(found, version) > 0 ? 'newer' : 'unchanged',
  previousVersion: found,
});

/**
 * Puts `body` into `existing` as the CodeMaps block. A missing file gets the block alone, a file
 * without one gets it appended after a blank line, and an existing block is replaced in place
 * when its version is older (or `force`). A block with a start marker but no end marker is left
 * alone (`malformed`) because replacing it could swallow the user's text.
 */
export const upsertBlock = (
  existing: string | null,
  body: string,
  version: string,
  force: boolean
): MarkerResult => {
  const block = `${blockStart(version)}\n${body.trim()}\n${BLOCK_END}`;
  if (existing === null) return { outcome: 'created', text: `${block}\n` };
  const eol = detectEol(existing);
  const start = BLOCK_START_PATTERN.exec(existing);
  if (!start) {
    const separator = existing.trim() === '' ? '' : `${existing.replace(/\s*$/, '')}${eol}${eol}`;
    return { outcome: 'appended', text: `${separator}${withEol(block, eol)}${eol}` };
  }
  const endIndex = existing.indexOf(BLOCK_END, start.index);
  if (endIndex < 0) return { outcome: 'malformed' };
  const found = start[1] ?? '0.0.0';
  if (!shouldRewrite(found, version, force)) {
    return keepOutcome(found, version);
  }
  const before = existing.slice(0, start.index);
  const after = existing.slice(endIndex + BLOCK_END.length);
  const text = `${before}${withEol(block, eol)}${after}`;
  return text === existing
    ? { outcome: 'unchanged', previousVersion: found }
    : { outcome: 'replaced', text, previousVersion: found };
};

/**
 * Writes a standalone file CodeMaps owns. `template` contains `FILE_MARKER_TOKEN` where the
 * marker line goes. A file without a marker belongs to the user and is never touched (`foreign`);
 * one with an older marker (or `force`) is rewritten whole.
 */
export const upsertOwnedFile = (
  existing: string | null,
  template: string,
  version: string,
  style: 'html' | 'slash' | 'hash',
  force: boolean
): MarkerResult => {
  const text = template.split(FILE_MARKER_TOKEN).join(fileMarker(version, style));
  if (existing === null) return { outcome: 'created', text };
  const found = FILE_MARKER_PATTERN.exec(existing)?.[1];
  if (found === undefined) return { outcome: 'foreign' };
  if (!shouldRewrite(found, version, force)) {
    return keepOutcome(found, version);
  }
  const eol = detectEol(existing);
  const next = withEol(text, eol);
  return next === existing
    ? { outcome: 'unchanged', previousVersion: found }
    : { outcome: 'replaced', text: next, previousVersion: found };
};

/** The CodeMaps block of a file (markers included), or null; used to hash what CodeMaps wrote. */
export const extractBlock = (text: string): string | null => {
  const start = BLOCK_START_PATTERN.exec(text);
  if (!start) return null;
  const endIndex = text.indexOf(BLOCK_END, start.index);
  return endIndex < 0 ? null : text.slice(start.index, endIndex + BLOCK_END.length);
};
