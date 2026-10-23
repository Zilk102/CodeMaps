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
}

export const DEFAULT_CLONE_OPTIONS: CloneOptions = {
  gram: 24,
  window: 8,
  minTokens: 70,
  minLines: 6,
  maxGroups: 40,
  maxBucket: 30,
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

  const buckets = new Map<number, number[]>();
  const hashesByStream = ids.map((array) => rollingHashes(array, options.gram));
  hashesByStream.forEach((hashes, streamIndex) => {
    for (const position of selectPositions(hashes, options.window)) {
      const key = hashes[position];
      const bucket = buckets.get(key);
      // Occurrences are stored as (stream, position) pairs flattened into one array.
      if (bucket) bucket.push(streamIndex, position);
      else buckets.set(key, [streamIndex, position]);
    }
  });

  const equalGram = (a: Int32Array, i: number, b: Int32Array, j: number) => {
    for (let offset = 0; offset < options.gram; offset += 1) {
      if (a[i + offset] !== b[j + offset]) return false;
    }
    return true;
  };

  const regions: Region[] = [];
  const regionIds = new Map<string, number>();
  const unionFind = new UnionFind();
  const nodeOf = (region: Region): number => {
    const key = `${region.stream}:${region.start}:${region.end}`;
    let node = regionIds.get(key);
    if (node === undefined) {
      node = unionFind.add();
      regionIds.set(key, node);
      regions[node] = region;
    }
    return node;
  };
  const seenPairs = new Set<string>();

  const tryPair = (streamA: number, posA: number, streamB: number, posB: number) => {
    const a = ids[streamA];
    const b = ids[streamB];
    if (streamA === streamB && Math.abs(posA - posB) < options.gram) return;

    let left = 0;
    while (posA - left > 0 && posB - left > 0 && a[posA - left - 1] === b[posB - left - 1]) {
      left += 1;
    }
    let right = options.gram;
    while (
      posA + right < a.length &&
      posB + right < b.length &&
      a[posA + right] === b[posB + right]
    ) {
      right += 1;
    }
    const regionA = { stream: streamA, start: posA - left, end: posA + right };
    const regionB = { stream: streamB, start: posB - left, end: posB + right };
    // A repetition inside one block is not two copies.
    if (streamA === streamB && regionA.start < regionB.end && regionB.start < regionA.end) return;
    const key = `${regionA.stream}:${regionA.start}|${regionB.stream}:${regionB.start}|${right + left}`;
    if (seenPairs.has(key)) return;
    seenPairs.add(key);
    unionFind.union(nodeOf(regionA), nodeOf(regionB));
  };

  for (const bucket of buckets.values()) {
    if (bucket.length < 4 || bucket.length / 2 > options.maxBucket) continue;
    // Different n-grams can share a hash: pair every occurrence with the first equal one.
    const representatives: Array<[number, number]> = [];
    for (let index = 0; index < bucket.length; index += 2) {
      const stream = bucket[index];
      const position = bucket[index + 1];
      const match = representatives.find(([repStream, repPosition]) =>
        equalGram(ids[repStream], repPosition, ids[stream], position)
      );
      if (match) tryPair(match[0], match[1], stream, position);
      else representatives.push([stream, position]);
    }
  }

  const byRoot = new Map<number, Region[]>();
  regions.forEach((region, node) => {
    const root = unionFind.find(node);
    const list = byRoot.get(root);
    if (list) list.push(region);
    else byRoot.set(root, [region]);
  });

  const controlIds = new Set(
    [...CONTROL_TOKENS].map((token) => vocabulary.get(token)).filter((id): id is number => !!id)
  );
  const groups: CloneGroup[] = [];
  for (const members of byRoot.values()) {
    // Same file, same start: keep the longest, which is the maximal match.
    const longestByStart = new Map<string, Region>();
    for (const region of members) {
      const key = `${region.stream}:${region.start}`;
      const existing = longestByStart.get(key);
      if (!existing || region.end - region.start > existing.end - existing.start) {
        longestByStart.set(key, region);
      }
    }
    const distinct = [...longestByStart.values()];
    if (distinct.length < 2) continue;
    // All copies of a group are cut to the length the shortest one shares.
    const length = Math.min(...distinct.map((region) => region.end - region.start));
    if (length < options.minTokens) continue;

    const first = distinct[0];
    const sample = ids[first.stream].slice(first.start, first.start + length);
    let controlTokens = 0;
    for (const id of sample) if (controlIds.has(id)) controlTokens += 1;
    if (controlTokens < 3) continue;

    const instances: CloneInstance[] = distinct
      .map((region) => ({
        file: streams[region.stream].file,
        startLine: streams[region.stream].lines[region.start],
        endLine: streams[region.stream].lines[region.start + length - 1],
        tokenStart: region.start,
        tokenEnd: region.start + length,
      }))
      .sort((a, b) => a.file.localeCompare(b.file) || a.startLine - b.startLine);
    // Periodic data (a table of similar entries) matches itself at every offset: keep copies
    // that do not overlap an earlier copy.
    const separate = instances.filter(
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
    if (separate.length < 2) continue;
    instances.splice(0, instances.length, ...separate);
    const lineCount = instances[0].endLine - instances[0].startLine + 1;
    if (lineCount < options.minLines) continue;
    groups.push({ tokenCount: length, lineCount, instances });
  }

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
