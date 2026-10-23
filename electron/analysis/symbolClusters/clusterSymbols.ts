import * as path from 'path';
import type { SplitCluster, SplitPlan, SymbolGraph, SymbolInfo } from './types';

const MIN_SYMBOLS = 6;
const MAX_CLUSTERS = 12;
const MIN_CLUSTER_CAP = 4;
const SYMBOLS_PER_CLUSTER = 6;
const MAX_LISTED_SYMBOLS = 15;
const MAX_SHARED_LISTED = 10;
const MAX_ROUNDS = 40;
const TOKEN_EDGE_WEIGHT = 0.5;
const DATA_EDGE_WEIGHT = 0.4;
const MAX_TOKEN_GROUP = 40;
const TINY_CLUSTER_LINES = 20;

/** Words that start almost every symbol of a layer and say nothing about its topic. */
const STOP_TOKENS = new Set([
  'get',
  'set',
  'put',
  'post',
  'patch',
  'delete',
  'list',
  'create',
  'update',
  'new',
  'handle',
  'handler',
  'handlers',
  'is',
  'has',
  'to',
  'from',
  'with',
  'find',
  'load',
  'save',
  'add',
  'remove',
  'build',
  'make',
  'parse',
  'run',
  'init',
  'the',
  'and',
  'for',
  'all',
  'one',
  'do',
  'on',
  'by',
  'func',
  'impl',
  'self',
  'this',
  'test',
  'new',
  'default',
  'util',
  'utils',
  'helper',
  'helpers',
  'request',
  'response',
  'result',
  'value',
  'data',
  'info',
  'item',
  'items',
  'type',
  'types',
]);

const CLASS_PER_FILE_LANGUAGES = new Set(['java', 'kotlin', 'c_sharp']);

const simpleName = (name: string) => name.split(/[.:]+/).filter(Boolean).pop() ?? name;

/** `users` and `user` name the same topic. */
const stem = (token: string) =>
  token.length > 4 && /[^siu]s$/.test(token) ? token.slice(0, -1) : token;

const tokenize = (name: string): string[] =>
  simpleName(name)
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2')
    .split(/[^A-Za-z0-9]+/)
    .map((token) => token.toLowerCase())
    .map(stem)
    .filter((token) => token.length >= 3 && !STOP_TOKENS.has(token) && !/^\d+$/.test(token));

type WeightedGraph = Array<Map<number, number>>;

const addEdge = (graph: WeightedGraph, a: number, b: number, weight: number) => {
  if (a === b) return;
  graph[a].set(b, (graph[a].get(b) ?? 0) + weight);
  graph[b].set(a, (graph[b].get(a) ?? 0) + weight);
};

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
    const better =
      candidate > bestGain + GAIN_EPSILON ||
      (Math.abs(candidate - bestGain) <= GAIN_EPSILON && target < best);
    if (better) {
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
 * Symbols that share a rare feature (a topic word of their names, a field or type they use)
 * attract each other, the stronger the rarer the feature.
 */
const addSharedFeatureEdges = (
  graph: WeightedGraph,
  members: number[],
  featuresOf: string[][],
  maxShareRatio: number,
  baseWeight: number
) => {
  const membersByFeature = new Map<string, number[]>();
  for (const index of members) {
    for (const feature of new Set(featuresOf[index])) {
      const bucket = membersByFeature.get(feature);
      if (bucket) bucket.push(index);
      else membersByFeature.set(feature, [index]);
    }
  }
  const maxShare = Math.min(
    MAX_TOKEN_GROUP,
    Math.max(3, Math.floor(members.length * maxShareRatio))
  );
  for (const group of membersByFeature.values()) {
    if (group.length < 2 || group.length > maxShare) continue;
    const weight = baseWeight * (1 - group.length / members.length);
    for (let a = 0; a < group.length; a += 1) {
      for (let b = a + 1; b < group.length; b += 1) addEdge(graph, group[a], group[b], weight);
    }
  }
};

/** Symbols that share a topic word of their names. */
const addTokenEdges = (
  graph: WeightedGraph,
  members: number[],
  tokensOf: string[][],
  maxShareRatio: number
) => addSharedFeatureEdges(graph, members, tokensOf, maxShareRatio, TOKEN_EDGE_WEIGHT);

/** Symbols that touch the same fields, types and functions of other files work on the same data. */
const addDataEdges = (graph: WeightedGraph, members: number[], usesOf: string[][]) =>
  addSharedFeatureEdges(graph, members, usesOf, 0.2, DATA_EDGE_WEIGHT);

interface Group {
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
    let bestIndex = -1;
    let bestWeight = 0;
    result.forEach((other, index) => {
      if (index === smallIndex) return;
      const weight = weightBetween(graph, small.members, new Set(other.members));
      if (weight > bestWeight) {
        bestWeight = weight;
        bestIndex = index;
      }
    });
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

const titleCase = (value: string) =>
  value
    .split(/[^A-Za-z0-9]+/)
    .filter(Boolean)
    .map((part) => part[0].toUpperCase() + part.slice(1))
    .join('');

const nameCluster = (
  members: number[],
  symbols: SymbolInfo[],
  tokensOf: string[][],
  documentFrequency: Map<string, number>,
  taken: Set<string>
): string => {
  const counts = new Map<string, number>();
  for (const member of members) {
    for (const token of new Set(tokensOf[member])) counts.set(token, (counts.get(token) ?? 0) + 1);
  }
  let best = '';
  let bestScore = 0;
  for (const [token, count] of counts) {
    // A token that is common in this cluster and rare elsewhere names it best.
    const score = count * (count / (documentFrequency.get(token) ?? count)) + token.length / 100;
    if (score > bestScore) {
      best = token;
      bestScore = score;
    }
  }
  if (!best) {
    const largest = [...members].sort((a, b) => symbols[b].lineCount - symbols[a].lineCount)[0];
    best =
      simpleName(symbols[largest].name)
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '_') || 'part';
  }
  let candidate = best;
  for (let suffix = 2; taken.has(candidate); suffix += 1) candidate = `${best}_${suffix}`;
  taken.add(candidate);
  return candidate;
};

const fileNameFor = (clusterName: string, language: string, extension: string) =>
  CLASS_PER_FILE_LANGUAGES.has(language)
    ? `${titleCase(clusterName)}${extension}`
    : `${clusterName}${extension}`;

/** What every step of the plan needs to know about the file. */
interface Analysis {
  symbols: SymbolInfo[];
  /** `references[a]` are the symbols `a` uses; `referrers[b]` are the symbols that use `b`. */
  references: Array<Set<number>>;
  referrers: Array<Set<number>>;
  hubs: Set<number>;
  orchestrators: Set<number>;
  /** Symbols that are clustered: everything except hubs and orchestrators. */
  active: number[];
  tokensOf: string[][];
  usesOf: string[][];
  documentFrequency: Map<string, number>;
  /** Call edges only, and call edges plus topic and data affinity. */
  referenceWeighted: WeightedGraph;
  weighted: WeightedGraph;
  linesOf: (members: number[]) => number;
}

const emptyGraph = (size: number): WeightedGraph =>
  Array.from({ length: size }, () => new Map<number, number>());

const indexRange = (size: number) => Array.from({ length: size }, (_, index) => index);

const buildReferences = (symbols: SymbolInfo[]): Array<Set<number>> => {
  const indexByName = new Map(symbols.map((symbol, index) => [symbol.name, index]));
  const references = symbols.map(() => new Set<number>());
  symbols.forEach((symbol, from) => {
    for (const ref of symbol.refs) {
      const to = indexByName.get(ref);
      if (to !== undefined && to !== from) references[from].add(to);
    }
  });
  return references;
};

/**
 * Sorts out the symbols that must not be clustered. A symbol that calls a third of the file (a
 * route table, a main) wires it together and would pull every cluster into one. A symbol that a
 * fifth of the file uses (at most a quarter of the file) is a shared helper.
 */
const classifyRoles = (symbols: SymbolInfo[], references: Array<Set<number>>) => {
  const orchestratorThreshold = Math.max(8, Math.ceil(symbols.length * 0.3));
  const orchestrators = new Set(
    indexRange(symbols.length).filter((index) => references[index].size >= orchestratorThreshold)
  );

  // Who uses a symbol, not counting the wiring code that uses everything.
  const referrers = symbols.map(() => new Set<number>());
  references.forEach((targets, from) => {
    if (orchestrators.has(from)) return;
    for (const to of targets) referrers[to].add(from);
  });

  const hubThreshold = Math.max(4, Math.ceil(symbols.length * 0.2));
  const hubs = new Set(
    indexRange(symbols.length)
      .filter((index) => !orchestrators.has(index) && referrers[index].size >= hubThreshold)
      .sort((a, b) => referrers[b].size - referrers[a].size)
      .slice(0, Math.max(1, Math.floor(symbols.length * 0.25)))
  );
  const active = indexRange(symbols.length).filter(
    (index) => !hubs.has(index) && !orchestrators.has(index)
  );
  return { referrers, hubs, orchestrators, active };
};

/** Call edges, then the weaker pull of shared topic words and shared data. */
const buildAffinity = (
  symbols: SymbolInfo[],
  references: Array<Set<number>>,
  roles: ReturnType<typeof classifyRoles>
) => {
  const { hubs, orchestrators, active } = roles;
  const weighted = emptyGraph(symbols.length);
  const referenceWeighted = emptyGraph(symbols.length);
  for (const from of active) {
    for (const to of references[from]) {
      if (hubs.has(to) || orchestrators.has(to)) continue;
      const weight = references[to].has(from) ? 1.5 : 1;
      addEdge(weighted, from, to, weight);
      addEdge(referenceWeighted, from, to, weight);
    }
  }

  const tokensOf = symbols.map((symbol) => tokenize(symbol.name));
  const documentFrequency = new Map<string, number>();
  for (const index of active) {
    for (const token of new Set(tokensOf[index])) {
      documentFrequency.set(token, (documentFrequency.get(token) ?? 0) + 1);
    }
  }
  addTokenEdges(weighted, active, tokensOf, 0.25);
  const usesOf = symbols.map((symbol) => symbol.uses ?? []);
  addDataEdges(weighted, active, usesOf);
  return { weighted, referenceWeighted, tokensOf, usesOf, documentFrequency };
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
const partition = (analysis: Analysis): Group[] => {
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

/** How much of the call traffic between clustered symbols stays inside a cluster. */
const measureCohesion = (analysis: Analysis, clusterOf: Map<number, number>): number => {
  let inside = 0;
  let total = 0;
  for (const from of analysis.active) {
    for (const [to, weight] of analysis.referenceWeighted[from]) {
      if (to < from) continue;
      total += weight;
      if (clusterOf.get(from) === clusterOf.get(to)) inside += weight;
    }
  }
  return total === 0 ? 0 : Math.round((inside / total) * 100) / 100;
};

const describeClusters = (
  analysis: Analysis,
  groups: Group[],
  clusterOf: Map<number, number>,
  graph: SymbolGraph,
  listLimit: number
): SplitCluster[] => {
  const { symbols, references, hubs, tokensOf, documentFrequency, linesOf } = analysis;
  const taken = new Set<string>();
  const names = groups.map((group) => {
    if (!group.misc) return nameCluster(group.members, symbols, tokensOf, documentFrequency, taken);
    taken.add('misc');
    return 'misc';
  });
  const extension = path.extname(graph.filePath);

  return groups.map((group, groupIndex) => {
    const ordered = [...group.members].sort((a, b) => symbols[a].startLine - symbols[b].startLine);
    const helperUse = new Map<number, number>();
    const talksTo = new Map<number, number>();
    for (const member of group.members) {
      for (const to of references[member]) {
        if (hubs.has(to)) {
          helperUse.set(to, (helperUse.get(to) ?? 0) + 1);
          continue;
        }
        const other = clusterOf.get(to);
        if (other !== undefined && other !== groupIndex) {
          talksTo.set(other, (talksTo.get(other) ?? 0) + 1);
        }
      }
    }
    return {
      name: names[groupIndex],
      suggestedFile: fileNameFor(names[groupIndex], graph.language, extension),
      symbolCount: ordered.length,
      lineCount: linesOf(group.members),
      symbols: ordered.slice(0, listLimit).map((member) => ({
        name: symbols[member].name,
        kind: symbols[member].kind,
        lines: symbols[member].lineCount,
      })),
      omittedSymbols: Math.max(0, ordered.length - listLimit),
      needsHelpers: [...helperUse.entries()]
        .sort((a, b) => b[1] - a[1])
        .slice(0, 6)
        .map(([hub]) => symbols[hub].name),
      dependsOn: [...talksTo.entries()].sort((a, b) => b[1] - a[1]).map(([other]) => names[other]),
    };
  });
};

const rateConfidence = (
  clusterCount: number,
  cohesion: number,
  largestShare: number
): SplitPlan['confidence'] => {
  if (clusterCount < 2 || cohesion < 0.45 || largestShare > 0.6) return 'low';
  return cohesion < 0.7 ? 'medium' : 'high';
};

const adviceFor = (
  clusterCount: number,
  largestShare: number,
  confidence: SplitPlan['confidence']
): string => {
  if (clusterCount < 2) {
    return 'The symbols do not fall apart into separate groups; split by responsibility, not by call structure.';
  }
  if (largestShare > 0.6) {
    return 'One cluster still holds most of the code: split it further by responsibility before moving files.';
  }
  if (confidence === 'low') {
    return 'Clusters are weakly separated (many cross-cluster calls); treat them as a starting point and check each seam.';
  }
  return 'Move each cluster to its own file; keep shared helpers in the original file or a small shared file, and update imports.';
};

const heaviestSymbols = (symbols: SymbolInfo[]): SplitPlan['heaviest'] =>
  [...symbols]
    .sort((a, b) => b.lineCount - a.lineCount)
    .slice(0, 3)
    .filter((symbol) => symbol.lineCount >= 40)
    .map((symbol) => ({ name: symbol.name, kind: symbol.kind, lines: symbol.lineCount }));

/**
 * Splits the declarations of one file into the groups that belong together: symbols that call
 * each other or share a topic word end up in the same cluster, and symbols used all over the
 * file are set aside as shared helpers. Returns null when the file is too small to split.
 */
export const planSplit = (
  graph: SymbolGraph,
  displayPath: string,
  listLimit = MAX_LISTED_SYMBOLS
): SplitPlan | null => {
  const { symbols } = graph;
  if (symbols.length < MIN_SYMBOLS) return null;

  const references = buildReferences(symbols);
  const roles = classifyRoles(symbols, references);
  if (roles.active.length < 2) return null;

  const analysis: Analysis = {
    symbols,
    references,
    ...roles,
    ...buildAffinity(symbols, references, roles),
    linesOf: (members) => members.reduce((total, member) => total + symbols[member].lineCount, 0),
  };

  const groups = partition(analysis);
  const clusterOf = new Map<number, number>();
  groups.forEach((group, groupIndex) => group.members.forEach((m) => clusterOf.set(m, groupIndex)));

  const cohesion = measureCohesion(analysis, clusterOf);
  const clusters = describeClusters(analysis, groups, clusterOf, graph, listLimit);
  const clusteredLines = groups.reduce((sum, group) => sum + analysis.linesOf(group.members), 0);
  const largestShare =
    Math.max(...groups.map((group) => analysis.linesOf(group.members))) /
    Math.max(1, clusteredLines);
  const confidence = rateConfidence(clusters.length, cohesion, largestShare);
  const symbolLines = analysis.linesOf(indexRange(symbols.length));

  return {
    file: displayPath,
    language: graph.language,
    lineCount: graph.lineCount,
    symbolCount: symbols.length,
    confidence,
    cohesion,
    coverage: Math.min(1, Math.round((symbolLines / Math.max(1, graph.lineCount)) * 100) / 100),
    sharedHelpers: [...roles.hubs]
      .sort((a, b) => roles.referrers[b].size - roles.referrers[a].size)
      .slice(0, MAX_SHARED_LISTED)
      .map((hub) => ({
        name: symbols[hub].name,
        kind: symbols[hub].kind,
        usedBy: roles.referrers[hub].size,
        lines: symbols[hub].lineCount,
      })),
    heaviest: heaviestSymbols(symbols),
    orchestrators: [...roles.orchestrators].map((index) => symbols[index].name),
    clusters,
    note: adviceFor(clusters.length, largestShare, confidence),
  };
};
