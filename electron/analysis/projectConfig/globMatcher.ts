/**
 * Glob matching for the `exclude` list of the project configuration.
 *
 * The dialect is the useful core of `.gitignore`: `*` matches within one path segment, `**`
 * matches across segments, `?` matches one character. A pattern with a slash (other than a
 * trailing one) is anchored at the project root; a bare name such as `vendor` matches at any depth.
 * A pattern that matches a folder excludes everything below it. Matching ignores case because the
 * projects CodeMaps opens live on case-insensitive file systems as often as on case-sensitive ones.
 */

/** Characters that mean something in a regular expression and must be escaped when literal. */
const REGEX_SPECIAL = /[.+^${}()|[\]\\]/;

/** Regular expression source for the `*` at `index`, and the index of the last glob character it used. */
const starSource = (glob: string, index: number): { source: string; last: number } => {
  if (glob[index + 1] !== '*') return { source: '[^/]*', last: index };
  // `**/` also matches zero folders, so `a/**/b` matches `a/b`.
  return glob[index + 2] === '/'
    ? { source: '(?:.*/)?', last: index + 2 }
    : { source: '.*', last: index + 1 };
};

/** Converts the glob wildcards of one pattern into regular expression source. */
const globToRegexSource = (glob: string): string => {
  let source = '';
  for (let index = 0; index < glob.length; index += 1) {
    const char = glob[index];
    if (char === '*') {
      const star = starSource(glob, index);
      source += star.source;
      index = star.last;
    } else {
      source += char === '?' ? '[^/]' : escapeLiteral(char);
    }
  }
  return source;
};

/** The character as literal regular expression source. */
const escapeLiteral = (char: string): string => (REGEX_SPECIAL.test(char) ? '\\' + char : char);

/** The pattern without a leading `./` or `/` and without trailing slashes, and whether it is anchored. */
const splitAnchor = (pattern: string): { body: string; anchored: boolean } => {
  const trimmed = pattern.trim().replace(/\\/g, '/');
  const startsAtRoot = trimmed.startsWith('/') || trimmed.startsWith('./');
  const body = trimmed.replace(/^\.?\//, '').replace(/\/+$/, '');
  return { body, anchored: startsAtRoot || body.includes('/') };
};

/** Compiles one pattern; an empty pattern matches nothing (null). */
const compilePattern = (pattern: string): RegExp | null => {
  const { body, anchored } = splitAnchor(pattern);
  if (!body) return null;
  const prefix = anchored ? '' : '(?:.*/)?';
  // The optional tail makes a pattern that names a folder cover the files below it.
  return new RegExp(`^${prefix}${globToRegexSource(body)}(?:/.*)?$`, 'i');
};

/**
 * Builds a matcher for a list of globs. The matcher takes a path relative to the project root
 * (either slash style) and says whether any glob excludes it. An empty list matches nothing.
 */
export const compileGlobs = (patterns: readonly string[]): ((relativePath: string) => boolean) => {
  const compiled = patterns.map(compilePattern).filter((regex): regex is RegExp => regex !== null);
  if (compiled.length === 0) return () => false;
  return (relativePath) => {
    const normalized = relativePath.replace(/\\/g, '/').replace(/^\.?\//, '');
    return compiled.some((regex) => regex.test(normalized));
  };
};
