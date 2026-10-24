import { UnionFind } from './cloneUnionFind';

export interface Region {
  stream: number;
  start: number;
  end: number;
}

/** Grows matching n-grams into maximal copies and remembers which regions are the same code. */
export class RegionMatcher {
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

/** Splits one hash bucket into the occurrences that really are the same n-gram (hashes can collide). */
const equalClasses = (bucket: number[], matcher: RegionMatcher): Array<Array<[number, number]>> => {
  const classes: Array<Array<[number, number]>> = [];
  for (let index = 0; index < bucket.length; index += 2) {
    const occurrence: [number, number] = [bucket[index], bucket[index + 1]];
    const home = classes.find(([[stream, position]]) =>
      matcher.equalGram(stream, position, occurrence[0], occurrence[1])
    );
    if (home) home.push(occurrence);
    else classes.push([occurrence]);
  }
  return classes;
};

/**
 * Pairs every two occurrences of an n-gram. Every pair is grown on its own, so whether two copies
 * are found never depends on which other copies of the same n-gram exist in the project.
 */
export const matchBuckets = (
  buckets: Map<number, number[]>,
  matcher: RegionMatcher,
  maxBucket: number
): void => {
  for (const bucket of buckets.values()) {
    if (bucket.length < 4 || bucket.length / 2 > maxBucket) continue;
    for (const members of equalClasses(bucket, matcher)) {
      for (let first = 0; first < members.length; first += 1) {
        for (let second = first + 1; second < members.length; second += 1) {
          matcher.addPair(...members[first], ...members[second]);
        }
      }
    }
  }
};

/** Same file, same start: keep the longest, which is the maximal match. */
export const maximalRegions = (members: Region[]): Region[] => {
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
