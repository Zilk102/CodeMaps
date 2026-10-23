import type { TokenStream } from './tokenize';

export interface CloneInstance {
  file: string;
  startLine: number;
  endLine: number;
  /** Token range inside the file's stream (end exclusive); kept for containment checks. */
  tokenStart: number;
  tokenEnd: number;
}

export interface CloneGroup {
  /** Tokens in one copy. */
  tokenCount: number;
  /** Lines of the first copy. */
  lineCount: number;
  instances: CloneInstance[];
}

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

const BASE = 1_000_003;

/** Hash of every `gram`-token window of one stream. */
const rollingHashes = (ids: Int32Array, gram: number): Int32Array => {
  const count = Math.max(0, ids.length - gram + 1);
  const hashes = new Int32Array(count);
  if (count === 0) return hashes;
  let power = 1;
  for (let index = 1; index < gram; index += 1) power = Math.imul(power, BASE);
  let hash = 0;
  for (let index = 0; index < gram; index += 1) hash = (Math.imul(hash, BASE) + ids[index]) | 0;
  hashes[0] = hash;
  for (let start = 1; start < count; start += 1) {
    hash = (hash - Math.imul(ids[start - 1], power)) | 0;
    hash = (Math.imul(hash, BASE) + ids[start + gram - 1]) | 0;
    hashes[start] = hash;
  }
  return hashes;
};

/** Winnowing: keep the minimum hash of each window, so any long enough match shares a kept hash. */
const selectPositions = (hashes: Int32Array, window: number): number[] => {
  const selected: number[] = [];
  let last = -1;
  const span = Math.min(window, hashes.length);
  for (let start = 0; start + span <= hashes.length; start += 1) {
    let best = start;
    for (let offset = 1; offset < span; offset += 1) {
      if (hashes[start + offset] <= hashes[best]) best = start + offset;
    }
    if (best !== last) {
      selected.push(best);
      last = best;
    }
  }
  return selected;
};

interface Region {
  stream: number;
  start: number;
  end: number;
}

class UnionFind {
  private readonly parent: number[] = [];
  add(): number {
    this.parent.push(this.parent.length);
    return this.parent.length - 1;
  }
  find(node: number): number {
    let root = node;
    while (this.parent[root] !== root) root = this.parent[root];
    while (this.parent[node] !== root) {
      const next = this.parent[node];
      this.parent[node] = root;
      node = next;
    }
    return root;
  }
  union(a: number, b: number) {
    const rootA = this.find(a);
    const rootB = this.find(b);
    if (rootA !== rootB) this.parent[rootB] = rootA;
  }
}

const CONTROL_TOKENS = new Set(['(', 'if', 'for', 'return', 'switch', 'while', 'match']);

/** Tokens as integers, so hashing and comparing them is cheap. */
const internStreams = (streams: TokenStream[]) => {
  const vocabulary = new Map<string, number>();
  const ids = streams.map((stream) => {
    const array = new Int32Array(stream.tokens.length);
    stream.tokens.forEach((token, index) => {
      let id = vocabulary.get(token);
      if (id === undefined) {
        id = vocabulary.size + 1;
        vocabulary.set(token, id);
      }
      array[index] = id;
    });
    return array;
  });
  return { ids, vocabulary };
};

/** Winnowed n-gram hash -> flattened (stream, position) occurrences. */
const collectBuckets = (ids: Int32Array[], options: CloneOptions): Map<number, number[]> => {
  const buckets = new Map<number, number[]>();
  ids.forEach((array, streamIndex) => {
    const hashes = rollingHashes(array, options.gram);
    for (const position of selectPositions(hashes, options.window)) {
      const key = hashes[position];
      const bucket = buckets.get(key);
      if (bucket) bucket.push(streamIndex, position);
      else buckets.set(key, [streamIndex, position]);
    }
  });
  return buckets;
};

/** Grows matching n-grams into maximal copies and remembers which regions are the same code. */
class RegionMatcher {
  private readonly regions: Region[] = [];
  private readonly regionIds = new Map<string, number>();
  private readonly unionFind = new UnionFind();
  private readonly seenPairs = new Set<string>();
  private readonly pairs: Array<[Region, Region]> = [];

  constructor(
    private readonly ids: Int32Array[],
    private readonly gram: number,
    private readonly maxGap: number
  ) {}

  equalGram(streamA: number, posA: number, streamB: number, posB: number): boolean {
    const a = this.ids[streamA];
    const b = this.ids[streamB];
    for (let offset = 0; offset < this.gram; offset += 1) {
      if (a[posA + offset] !== b[posB + offset]) return false;
    }
    return true;
  }

  private nodeOf(region: Region): number {
    const key = `${region.stream}:${region.start}:${region.end}`;
    let node = this.regionIds.get(key);
    if (node === undefined) {
      node = this.unionFind.add();
      this.regionIds.set(key, node);
      this.regions[node] = region;
    }
    return node;
  }

  /** How far two equal n-grams keep matching to the left and to the right. */
  private extent(streamA: number, posA: number, streamB: number, posB: number) {
    const a = this.ids[streamA];
    const b = this.ids[streamB];
    let left = 0;
    while (posA - left > 0 && posB - left > 0 && a[posA - left - 1] === b[posB - left - 1]) {
      left += 1;
    }
    let right = this.gram;
    while (
      posA + right < a.length &&
      posB + right < b.length &&
      a[posA + right] === b[posB + right]
    ) {
      right += 1;
    }
    return { left, right };
  }

  addPair(streamA: number, posA: number, streamB: number, posB: number): void {
    if (streamA === streamB && Math.abs(posA - posB) < this.gram) return;
    const { left, right } = this.extent(streamA, posA, streamB, posB);
    const regionA = { stream: streamA, start: posA - left, end: posA + right };
    const regionB = { stream: streamB, start: posB - left, end: posB + right };
    // A repetition inside one block is not two copies.
    if (streamA === streamB && regionA.start < regionB.end && regionB.start < regionA.end) return;
    const key = `${streamA}:${regionA.start}|${streamB}:${regionB.start}|${right + left}`;
    if (this.seenPairs.has(key)) return;
    this.seenPairs.add(key);
    this.pairs.push([regionA, regionB]);
  }

  /**
   * Two exact matches of the same pair of files that follow each other with only a few tokens
   * between them are one copy that was edited in between (an extra argument, a renamed branch).
   */
  private mergeNeighbours(): Array<[Region, Region]> {
    const chains = new Map<string, Array<[Region, Region]>>();
    const ordered = [...this.pairs].sort(
      (x, y) => x[0].stream - y[0].stream || x[0].start - y[0].start
    );
    for (const [a, b] of ordered) {
      const bucket = chains.get(`${a.stream}|${b.stream}`) ?? [];
      chains.set(`${a.stream}|${b.stream}`, bucket);
      // Equal tokens just before a match can overlap the previous match, so only the gap that
      // is left after it counts, and the new match has to reach further on both sides.
      const previous = bucket.find(
        ([chainA, chainB]) =>
          a.start - chainA.end <= this.maxGap &&
          b.start - chainB.end <= this.maxGap &&
          a.end > chainA.end &&
          b.end > chainB.end &&
          // two copies inside one file must not run into each other
          (a.stream !== b.stream || b.start > a.end)
      );
      if (previous) {
        previous[0].end = a.end;
        previous[1].end = b.end;
      } else {
        bucket.push([{ ...a }, { ...b }]);
      }
    }
    return [...chains.values()].flat();
  }

  /** Regions that are copies of each other, one list per group. */
  groups(): Region[][] {
    for (const [regionA, regionB] of this.mergeNeighbours()) {
      this.unionFind.union(this.nodeOf(regionA), this.nodeOf(regionB));
    }
    const byRoot = new Map<number, Region[]>();
    this.regions.forEach((region, node) => {
      const root = this.unionFind.find(node);
      byRoot.set(root, [...(byRoot.get(root) ?? []), region]);
    });
    return [...byRoot.values()];
  }
}

/** Pairs every occurrence of an n-gram with the first equal one (hashes can collide). */
const matchBuckets = (
  buckets: Map<number, number[]>,
  matcher: RegionMatcher,
  maxBucket: number
): void => {
  for (const bucket of buckets.values()) {
    if (bucket.length < 4 || bucket.length / 2 > maxBucket) continue;
    const representatives: Array<[number, number]> = [];
    for (let index = 0; index < bucket.length; index += 2) {
      const stream = bucket[index];
      const position = bucket[index + 1];
      const match = representatives.find(([repStream, repPosition]) =>
        matcher.equalGram(repStream, repPosition, stream, position)
      );
      if (match) matcher.addPair(match[0], match[1], stream, position);
      else representatives.push([stream, position]);
    }
  }
};

/** Same file, same start: keep the longest, which is the maximal match. */
const maximalRegions = (members: Region[]): Region[] => {
  const longestByStart = new Map<string, Region>();
  for (const region of members) {
    const key = `${region.stream}:${region.start}`;
    const existing = longestByStart.get(key);
    if (!existing || region.end - region.start > existing.end - existing.start) {
      longestByStart.set(key, region);
    }
  }
  return [...longestByStart.values()];
};

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

const toGroup = (
  members: Region[],
  streams: TokenStream[],
  ids: Int32Array[],
  controlIds: Set<number>,
  options: CloneOptions
): CloneGroup | null => {
  const distinct = maximalRegions(members);
  if (distinct.length < 2) return null;
  // All copies of a group are cut to the length the shortest one shares.
  const length = Math.min(...distinct.map((region) => region.end - region.start));
  if (length < options.minTokens) return null;

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
  streams: TokenStream[],
  overrides: Partial<CloneOptions> = {}
): CloneGroup[] => {
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
