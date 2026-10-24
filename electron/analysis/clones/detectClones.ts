// Token-based clone detector: finds copied code across files with winnowed n-gram hashes and reports
// it as groups of copies.

import type { TokenStream } from './tokenize';
import { collectBuckets, internStreams } from './cloneWinnowing';
import { matchBuckets, maximalRegions, RegionMatcher, type Region } from './cloneRegions';

/** One copy of a clone group: its file, line range and token range. */
export interface CloneInstance {
  file: string;
  startLine: number;
  endLine: number;
  /** Token range inside the file's stream (end exclusive); kept for containment checks. */
  tokenStart: number;
  tokenEnd: number;
}

/** A set of two or more copies of the same code, all cut to the same token length. */
export interface CloneGroup {
  /** Tokens in one copy. */
  tokenCount: number;
  /** Lines of the first copy. */
  lineCount: number;
  instances: CloneInstance[];
}

/**
 * Tuning of the detector; `DEFAULT_CLONE_OPTIONS` holds the values used in production and tests may
 * override single fields.
 */
export interface CloneOptions {
  /** Length of the token n-gram that is hashed. */
  gram: number;
  /** Window of n-gram hashes the smallest of which is kept (winnowing). */
  window: number;
  minTokens: number;
  minLines: number;
  maxGroups: number;
  /** An n-gram that occurs more often than this is boilerplate, not a clone. */
  maxBucket: number;
  /** Tokens that may differ between two exact matches for them to count as one edited copy. */
  maxGap: number;
}

export const DEFAULT_CLONE_OPTIONS: CloneOptions = {
  gram: 24,
  window: 8,
  minTokens: 70,
  minLines: 6,
  maxGroups: 40,
  maxBucket: 30,
  maxGap: 12,
};

const CONTROL_TOKENS = new Set(['(', 'if', 'for', 'return', 'switch', 'while', 'match']);

/**
 * Periodic data (a table of similar entries) matches itself at every offset: keep only the
 * copies that do not overlap an earlier copy.
 */
const withoutOverlaps = (instances: CloneInstance[]): CloneInstance[] =>
  instances.filter(
    (instance, index) =>
      !instances
        .slice(0, index)
        .some(
          (earlier) =>
            earlier.file === instance.file &&
            instance.tokenStart < earlier.tokenEnd &&
            earlier.tokenStart < instance.tokenEnd
        )
  );

/** A group is worth reporting when its code does something (calls, branches), not just lists data. */
const hasControlFlow = (sample: Int32Array, controlIds: Set<number>): boolean => {
  let count = 0;
  for (const id of sample) if (controlIds.has(id)) count += 1;
  return count >= 3;
};

/**
 * All copies of a group are cut to the length the shortest one shares. A copy that shares too
 * little is left out instead of dragging the others below the threshold, so two long copies are
 * found whether or not a third, partly similar piece of code exists.
 */
const sharedLength = (
  regions: Region[],
  minTokens: number
): { distinct: Region[]; length: number } => {
  const longest = [...regions].sort((a, b) => b.end - b.start - (a.end - a.start));
  for (let count = longest.length; count >= 2; count -= 1) {
    const length = longest[count - 1].end - longest[count - 1].start;
    if (length >= minTokens) return { distinct: longest.slice(0, count), length };
  }
  return { distinct: [], length: 0 };
};

/**
 * Turns the regions of one match class into a reported group. Returns null when fewer than two
 * distinct copies share `minTokens` tokens, the code has no control flow (pure data) or the copies
 * are shorter than `minLines`.
 */
const toGroup = (
  members: Region[],
  streams: TokenStream[],
  ids: Int32Array[],
  controlIds: Set<number>,
  options: CloneOptions
): CloneGroup | null => {
  const { distinct, length } = sharedLength(maximalRegions(members), options.minTokens);
  if (distinct.length < 2) return null;

  const first = distinct[0];
  if (!hasControlFlow(ids[first.stream].slice(first.start, first.start + length), controlIds)) {
    return null;
  }

  const instances = withoutOverlaps(
    distinct
      .map((region) => ({
        file: streams[region.stream].file,
        startLine: streams[region.stream].lines[region.start],
        endLine: streams[region.stream].lines[region.start + length - 1],
        tokenStart: region.start,
        tokenEnd: region.start + length,
      }))
      .sort((a, b) => a.file.localeCompare(b.file) || a.startLine - b.startLine)
  );
  if (instances.length < 2) return null;
  const lineCount = instances[0].endLine - instances[0].startLine + 1;
  return lineCount < options.minLines ? null : { tokenCount: length, lineCount, instances };
};

/**
 * Finds copied code across and inside files. Tokens are normalized (names, numbers and strings
 * are interchangeable), so a block pasted with renamed variables still matches. Works on any
 * token stream, so the same detector serves every language.
 */
export const detectClones = (
  unordered: TokenStream[],
  overrides: Partial<CloneOptions> = {}
): CloneGroup[] => {
  // The order the files arrive in (graph order, directory walk) must not change the result.
  const streams = [...unordered].sort((a, b) => (a.file < b.file ? -1 : a.file > b.file ? 1 : 0));
  const options = { ...DEFAULT_CLONE_OPTIONS, ...overrides };
  const { ids, vocabulary } = internStreams(streams);

  const matcher = new RegionMatcher(ids, options.gram, options.maxGap);
  matchBuckets(collectBuckets(ids, options), matcher, options.maxBucket);

  const controlIds = new Set(
    [...CONTROL_TOKENS].map((token) => vocabulary.get(token)).filter((id): id is number => !!id)
  );
  const groups = matcher
    .groups()
    .map((members) => toGroup(members, streams, ids, controlIds, options))
    .filter((group): group is CloneGroup => group !== null);

  return dropSubsumed(groups)
    .sort(
      (a, b) =>
        b.tokenCount * b.instances.length - a.tokenCount * a.instances.length ||
        a.instances[0].file.localeCompare(b.instances[0].file)
    )
    .slice(0, options.maxGroups);
};

/** A group whose every copy lies inside a copy of a bigger group adds nothing. */
const dropSubsumed = (groups: CloneGroup[]): CloneGroup[] => {
  const ordered = [...groups].sort((a, b) => b.tokenCount - a.tokenCount);
  const kept: CloneGroup[] = [];
  for (const group of ordered) {
    const subsumed = kept.some((bigger) =>
      group.instances.every((instance) =>
        bigger.instances.some(
          (candidate) =>
            candidate.file === instance.file &&
            candidate.tokenStart <= instance.tokenStart &&
            instance.tokenEnd <= candidate.tokenEnd
        )
      )
    );
    if (!subsumed) kept.push(group);
  }
  return kept;
};
