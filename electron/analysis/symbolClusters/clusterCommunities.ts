// Groups the symbols of a file into clusters with a deterministic modularity optimisation, then
// merges and caps the groups to a reviewable number.

import type { Analysis, WeightedGraph } from './clusterEdges';
import { addDataEdges, addEdge, addTokenEdges, emptyGraph, indexRange } from './clusterEdges';

const MAX_CLUSTERS = 12;
const MIN_CLUSTER_CAP = 4;
const SYMBOLS_PER_CLUSTER = 6;
const MAX_ROUNDS = 40;
const TINY_CLUSTER_LINES = 20;

const RESOLUTION = 1.2;
const SUBDIVIDE_RESOLUTION = 2;
const SUBDIVIDE_MIN_SYMBOLS = 15;
const SUBDIVIDE_MIN_SHARE = 0.25;

/**
 * Greedy modularity optimisation (the local-moving phase of Louvain), deterministic: every node
 * joins the neighbouring community it is most strongly tied to relative to chance. A resolution
 * above 1 favours several small, tight groups over one big loose one.
 */
const detectCommunities = (
  graph: WeightedGraph,
  active: number[],
  resolution = RESOLUTION
): Map<number, number> => {
  const community = new Map<number, number>(active.map((node) => [node, node]));
  const degree = new Map<number, number>();
  let totalWeight = 0;
  for (const node of active) {
    const sum = [...graph[node].values()].reduce((acc, weight) => acc + weight, 0);
    degree.set(node, sum);
    totalWeight += sum;
  }
  const m = totalWeight / 2;
  if (m === 0) return community;

  const communityDegree = new Map<number, number>(active.map((node) => [node, degree.get(node)!]));
  const move = (node: number): boolean =>
    moveToBestCommunity(
      { graph, community, communityDegree, m, resolution },
      node,
      degree.get(node)!
    );
  for (let round = 0; round < MAX_ROUNDS; round += 1) {
    // Evaluate every node each round (no short-circuit), as the local-moving phase requires.
    const moved = active.map(move).some(Boolean);
    if (!moved) break;
  }
  return community;
};

interface ModularityState {
  graph: WeightedGraph;
  community: Map<number, number>;
  communityDegree: Map<number, number>;
  /** Half of the total edge weight. */
  m: number;
  resolution: number;
}

/** Edge weight from `node` into each neighbouring community. */
const weightsToCommunities = (
  graph: WeightedGraph,
  community: Map<number, number>,
  node: number
): Map<number, number> => {
  const toCommunity = new Map<number, number>();
  for (const [neighbour, weight] of graph[node]) {
    const target = community.get(neighbour);
    if (target !== undefined) toCommunity.set(target, (toCommunity.get(target) ?? 0) + weight);
  }
  return toCommunity;
};

const GAIN_EPSILON = 1e-12;

/** A clearly higher gain wins; a tie goes to the lower-numbered community. */
const isBetterGain = (candidate: number, bestGain: number, hasLowerId: boolean) =>
  candidate > bestGain + GAIN_EPSILON ||
  (Math.abs(candidate - bestGain) <= GAIN_EPSILON && hasLowerId);

/** Moves one node to the community with the best modularity gain; true when it moved. */
const moveToBestCommunity = (state: ModularityState, node: number, k: number): boolean => {
  const { graph, community, communityDegree, m, resolution } = state;
  const own = community.get(node)!;
  const toCommunity = weightsToCommunities(graph, community, node);
  communityDegree.set(own, communityDegree.get(own)! - k);
  const gain = (target: number) =>
    (toCommunity.get(target) ?? 0) / m -
    (resolution * (communityDegree.get(target) ?? 0) * k) / (2 * m * m);
  let best = own;
  let bestGain = gain(own);
  for (const target of toCommunity.keys()) {
    const candidate = gain(target);
    if (isBetterGain(candidate, bestGain, target < best)) {
      best = target;
      bestGain = candidate;
    }
  }
  communityDegree.set(best, (communityDegree.get(best) ?? 0) + k);
  if (best === own) return false;
  community.set(node, best);
  return true;
};

/**
 * A set of symbol indexes proposed as one new file. `misc` marks the catch-all group for symbols
 * tied to nothing.
 */
export interface Group {
  members: number[];
  /** Leftovers that are tied to nothing: they share one catch-all file. */
  misc?: boolean;
}

const weightBetween = (graph: WeightedGraph, from: number[], to: Set<number>): number => {
  let total = 0;
  for (const node of from) {
    for (const [neighbour, weight] of graph[node]) if (to.has(neighbour)) total += weight;
  }
  return total;
};

/** The other group the group at `index` has the most call weight to, or -1 when it has none. */
const strongestNeighbourIndex = (groups: Group[], index: number, graph: WeightedGraph): number => {
  let bestIndex = -1;
  let bestWeight = 0;
  groups.forEach((other, otherIndex) => {
    if (otherIndex === index) return;
    const weight = weightBetween(graph, groups[index].members, new Set(other.members));
    if (weight > bestWeight) {
      bestWeight = weight;
      bestIndex = otherIndex;
    }
  });
  return bestIndex;
};

/** Folds the groups that are too small to be a file into the group they talk to most. */
const mergeSmallGroups = (
  groups: Group[],
  graph: WeightedGraph,
  linesOf: (members: number[]) => number
): Group[] => {
  const result = groups.map((group) => ({ members: [...group.members] }));
  const isSmall = (group: Group) =>
    group.members.length < 2 ||
    (group.members.length < 3 && linesOf(group.members) < TINY_CLUSTER_LINES);

  let guard = result.length * 2;
  while (guard-- > 0) {
    const smallIndex = result.findIndex((group) => result.length > 1 && isSmall(group));
    if (smallIndex < 0) break;
    const small = result[smallIndex];
    const bestIndex = strongestNeighbourIndex(result, smallIndex, graph);
    if (bestIndex < 0) break;
    result[bestIndex].members.push(...small.members);
    result.splice(smallIndex, 1);
  }
  return result;
};

/** Reduces the number of groups to what a person can review at once. */
const capGroups = (
  groups: Group[],
  graph: WeightedGraph,
  linesOf: (m: number[]) => number,
  maxClusters: number
) => {
  const result = [...groups];
  while (result.length > maxClusters) {
    const candidates = result.filter((group) => !group.misc);
    candidates.sort((a, b) => linesOf(a.members) - linesOf(b.members));
    const smallest = candidates[0];
    result.splice(result.indexOf(smallest), 1);
    let target: Group | undefined;
    let bestWeight = 0;
    for (const other of result) {
      const weight = weightBetween(graph, smallest.members, new Set(other.members));
      if (weight > bestWeight) {
        bestWeight = weight;
        target = other;
      }
    }
    // Nothing ties it to another group: it goes to the catch-all instead of a random neighbour.
    if (!target) {
      target = result.find((group) => group.misc);
      if (!target) {
        target = { members: [], misc: true };
        result.push(target);
      }
    }
    target.members.push(...smallest.members);
  }
  return result;
};

const groupByLabel = (active: number[], labels: Map<number, number>): Group[] => {
  const byLabel = new Map<number, number[]>();
  for (const index of active) {
    const label = labels.get(index)!;
    byLabel.set(label, [...(byLabel.get(label) ?? []), index]);
  }
  return [...byLabel.values()].map((members) => ({ members }));
};

/** A big cluster is a topic with sub-topics: look again inside it, with its own word statistics. */
const subdivide = (analysis: Analysis, group: Group): Group[] => {
  const { symbols, referenceWeighted, tokensOf, usesOf } = analysis;
  const local = emptyGraph(symbols.length);
  const inGroup = new Set(group.members);
  for (const from of group.members) {
    for (const [to, weight] of referenceWeighted[from]) {
      if (to > from && inGroup.has(to)) addEdge(local, from, to, weight);
    }
  }
  addTokenEdges(local, group.members, tokensOf, 0.5);
  addDataEdges(local, group.members, usesOf);
  const inner = detectCommunities(local, group.members, SUBDIVIDE_RESOLUTION);
  const parts = groupByLabel(group.members, inner);
  return parts.length > 1 ? parts : [group];
};

/** Splits clusters that are too big, then folds the leftovers into a small, sensible set. */
export const partition = (analysis: Analysis): Group[] => {
  const { symbols, active, weighted, linesOf } = analysis;
  const totalLines = linesOf(indexRange(symbols.length));
  let groups = groupByLabel(active, detectCommunities(weighted, active));
  groups = groups.flatMap((group) => {
    const tooBig =
      group.members.length > SUBDIVIDE_MIN_SYMBOLS &&
      linesOf(group.members) > totalLines * SUBDIVIDE_MIN_SHARE;
    return tooBig ? subdivide(analysis, group) : [group];
  });
  groups = mergeSmallGroups(groups, weighted, linesOf);

  const loose = groups.filter((group) => group.members.length < 2);
  if (loose.length > 0 && groups.length > loose.length) {
    groups = [
      ...groups.filter((group) => group.members.length >= 2),
      { members: loose.flatMap((group) => group.members), misc: true },
    ];
  }

  // A small file does not need a dozen files: the cap grows with the number of symbols.
  const maxClusters = Math.min(
    MAX_CLUSTERS,
    Math.max(MIN_CLUSTER_CAP, Math.ceil(symbols.length / SYMBOLS_PER_CLUSTER))
  );
  groups = capGroups(groups, weighted, linesOf, maxClusters);
  return groups.sort((a, b) => linesOf(b.members) - linesOf(a.members));
};
