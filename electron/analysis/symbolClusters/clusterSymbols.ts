import * as path from 'path';
import type { SplitCluster, SplitPlan, SymbolGraph, SymbolInfo } from './types';

const MIN_SYMBOLS = 6;
const MAX_CLUSTERS = 8;
const MAX_LISTED_SYMBOLS = 15;
const MAX_SHARED_LISTED = 10;
const MAX_ROUNDS = 40;
const TOKEN_EDGE_WEIGHT = 0.5;
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
    let sum = 0;
    for (const weight of graph[node].values()) sum += weight;
    degree.set(node, sum);
    totalWeight += sum;
  }
  const m = totalWeight / 2;
  if (m === 0) return community;

  const communityDegree = new Map<number, number>(active.map((node) => [node, degree.get(node)!]));
  for (let round = 0; round < MAX_ROUNDS; round += 1) {
    let moved = false;
    for (const node of active) {
      const own = community.get(node)!;
      const k = degree.get(node)!;
      const toCommunity = new Map<number, number>();
      for (const [neighbour, weight] of graph[node]) {
        const target = community.get(neighbour);
        if (target !== undefined) toCommunity.set(target, (toCommunity.get(target) ?? 0) + weight);
      }
      communityDegree.set(own, communityDegree.get(own)! - k);
      const gain = (target: number) =>
        (toCommunity.get(target) ?? 0) / m -
        (resolution * (communityDegree.get(target) ?? 0) * k) / (2 * m * m);
      let best = own;
      let bestGain = gain(own);
      for (const target of toCommunity.keys()) {
        const candidate = gain(target);
        if (
          candidate > bestGain + 1e-12 ||
          (Math.abs(candidate - bestGain) <= 1e-12 && target < best)
        ) {
          best = target;
          bestGain = candidate;
        }
      }
      communityDegree.set(best, (communityDegree.get(best) ?? 0) + k);
      if (best !== own) {
        community.set(node, best);
        moved = true;
      }
    }
    if (!moved) break;
  }
  return community;
};

/** Symbols that share a topic word attract each other, the stronger the rarer the word. */
const addTokenEdges = (
  graph: WeightedGraph,
  members: number[],
  tokensOf: string[][],
  maxShareRatio: number
) => {
  const membersByToken = new Map<string, number[]>();
  for (const index of members) {
    for (const token of new Set(tokensOf[index])) {
      const bucket = membersByToken.get(token);
      if (bucket) bucket.push(index);
      else membersByToken.set(token, [index]);
    }
  }
  const maxShare = Math.min(
    MAX_TOKEN_GROUP,
    Math.max(3, Math.floor(members.length * maxShareRatio))
  );
  for (const group of membersByToken.values()) {
    if (group.length < 2 || group.length > maxShare) continue;
    const weight = TOKEN_EDGE_WEIGHT * (1 - group.length / members.length);
    for (let a = 0; a < group.length; a += 1) {
      for (let b = a + 1; b < group.length; b += 1) addEdge(graph, group[a], group[b], weight);
    }
  }
};

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
const capGroups = (groups: Group[], graph: WeightedGraph, linesOf: (m: number[]) => number) => {
  const result = [...groups];
  while (result.length > MAX_CLUSTERS) {
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

/**
 * Splits the declarations of one file into the groups that belong together: symbols that call
 * each other or share a topic word end up in the same cluster, and symbols used all over the
 * file are set aside as shared helpers. Returns null when the file is too small to split.
 */
export const planSplit = (graph: SymbolGraph, displayPath: string): SplitPlan | null => {
  const { symbols } = graph;
  if (symbols.length < MIN_SYMBOLS) return null;

  const indexByName = new Map(symbols.map((symbol, index) => [symbol.name, index]));
  const references: Array<Set<number>> = symbols.map(() => new Set<number>());
  symbols.forEach((symbol, from) => {
    for (const ref of symbol.refs) {
      const to = indexByName.get(ref);
      if (to !== undefined && to !== from) references[from].add(to);
    }
  });

  // A symbol that calls a third of the file (a route table, a main) wires the file together; it
  // would pull every cluster into one, so it stays put instead of being clustered.
  const orchestratorThreshold = Math.max(8, Math.ceil(symbols.length * 0.3));
  const orchestrators = new Set(
    symbols
      .map((_, index) => index)
      .filter((index) => references[index].size >= orchestratorThreshold)
  );

  // Who uses a symbol, not counting the wiring code that uses everything.
  const referrers: Array<Set<number>> = symbols.map(() => new Set<number>());
  references.forEach((targets, from) => {
    if (orchestrators.has(from)) return;
    for (const to of targets) referrers[to].add(from);
  });

  // Shared helpers: referenced by a fifth of the file (at least 4 symbols), at most a quarter of it.
  const hubThreshold = Math.max(4, Math.ceil(symbols.length * 0.2));
  const hubCandidates = symbols
    .map((_, index) => index)
    .filter((index) => !orchestrators.has(index) && referrers[index].size >= hubThreshold)
    .sort((a, b) => referrers[b].size - referrers[a].size)
    .slice(0, Math.max(1, Math.floor(symbols.length * 0.25)));
  const hubs = new Set(hubCandidates);
  const active = symbols
    .map((_, index) => index)
    .filter((index) => !hubs.has(index) && !orchestrators.has(index));
  if (active.length < 2) return null;

  const weighted: WeightedGraph = symbols.map(() => new Map<number, number>());
  const referenceWeighted: WeightedGraph = symbols.map(() => new Map<number, number>());
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

  const labels = detectCommunities(weighted, active);
  const byLabel = new Map<number, number[]>();
  for (const index of active) {
    const label = labels.get(index)!;
    const bucket = byLabel.get(label);
    if (bucket) bucket.push(index);
    else byLabel.set(label, [index]);
  }

  const linesOf = (members: number[]) =>
    members.reduce((total, member) => total + symbols[member].lineCount, 0);
  let groups: Group[] = [...byLabel.values()].map((members) => ({ members }));
  const totalLines = symbols.reduce((sum, symbol) => sum + symbol.lineCount, 0);
  groups = groups.flatMap((group) => {
    const tooBig =
      group.members.length > SUBDIVIDE_MIN_SYMBOLS &&
      linesOf(group.members) > totalLines * SUBDIVIDE_MIN_SHARE;
    if (!tooBig) return [group];
    // A big cluster is a topic with sub-topics: look again inside it, with its own word statistics.
    const local: WeightedGraph = symbols.map(() => new Map<number, number>());
    const inGroup = new Set(group.members);
    for (const from of group.members) {
      for (const [to, weight] of referenceWeighted[from]) {
        if (to > from && inGroup.has(to)) addEdge(local, from, to, weight);
      }
    }
    addTokenEdges(local, group.members, tokensOf, 0.5);
    const inner = detectCommunities(local, group.members, SUBDIVIDE_RESOLUTION);
    const parts = new Map<number, number[]>();
    for (const member of group.members) {
      const label = inner.get(member)!;
      parts.set(label, [...(parts.get(label) ?? []), member]);
    }
    return parts.size > 1 ? [...parts.values()].map((members) => ({ members })) : [group];
  });
  groups = mergeSmallGroups(groups, weighted, linesOf);
  const loose = groups.filter((group) => group.members.length < 2);
  if (loose.length > 0 && groups.length > loose.length) {
    groups = [
      ...groups.filter((group) => group.members.length >= 2),
      { members: loose.flatMap((group) => group.members), misc: true },
    ];
  }
  groups = capGroups(groups, weighted, linesOf);
  groups.sort((a, b) => linesOf(b.members) - linesOf(a.members));

  const clusterOf = new Map<number, number>();
  groups.forEach((group, groupIndex) => group.members.forEach((m) => clusterOf.set(m, groupIndex)));

  // Cohesion: how much of the call traffic between non-shared symbols stays inside a cluster.
  let inside = 0;
  let total = 0;
  for (const from of active) {
    for (const [to, weight] of referenceWeighted[from]) {
      if (to < from) continue;
      total += weight;
      if (clusterOf.get(from) === clusterOf.get(to)) inside += weight;
    }
  }
  const cohesion = total === 0 ? 0 : Math.round((inside / total) * 100) / 100;

  const taken = new Set<string>();
  const names = groups.map((group) => {
    if (!group.misc) return nameCluster(group.members, symbols, tokensOf, documentFrequency, taken);
    taken.add('misc');
    return 'misc';
  });
  const extension = path.extname(graph.filePath);

  const clusters: SplitCluster[] = groups.map((group, groupIndex) => {
    const ordered = [...group.members].sort((a, b) => symbols[a].startLine - symbols[b].startLine);
    const helperUse = new Map<number, number>();
    const talksTo = new Map<number, number>();
    for (const member of group.members) {
      for (const to of references[member]) {
        if (hubs.has(to)) helperUse.set(to, (helperUse.get(to) ?? 0) + 1);
        else {
          const other = clusterOf.get(to);
          if (other !== undefined && other !== groupIndex) {
            talksTo.set(other, (talksTo.get(other) ?? 0) + 1);
          }
        }
      }
    }
    return {
      name: names[groupIndex],
      suggestedFile: fileNameFor(names[groupIndex], graph.language, extension),
      symbolCount: ordered.length,
      lineCount: linesOf(group.members),
      symbols: ordered.slice(0, MAX_LISTED_SYMBOLS).map((member) => ({
        name: symbols[member].name,
        kind: symbols[member].kind,
        lines: symbols[member].lineCount,
      })),
      omittedSymbols: Math.max(0, ordered.length - MAX_LISTED_SYMBOLS),
      needsHelpers: [...helperUse.entries()]
        .sort((a, b) => b[1] - a[1])
        .slice(0, 6)
        .map(([hub]) => symbols[hub].name),
      dependsOn: [...talksTo.entries()].sort((a, b) => b[1] - a[1]).map(([other]) => names[other]),
    };
  });

  const sharedHelpers = [...hubs]
    .sort((a, b) => referrers[b].size - referrers[a].size)
    .slice(0, MAX_SHARED_LISTED)
    .map((hub) => ({
      name: symbols[hub].name,
      kind: symbols[hub].kind,
      usedBy: referrers[hub].size,
      lines: symbols[hub].lineCount,
    }));

  const largestShare =
    Math.max(...groups.map((group) => linesOf(group.members))) /
    Math.max(
      1,
      groups.reduce((sum, group) => sum + linesOf(group.members), 0)
    );
  const symbolLines = symbols.reduce((sum, symbol) => sum + symbol.lineCount, 0);
  const coverage = Math.min(
    1,
    Math.round((symbolLines / Math.max(1, graph.lineCount)) * 100) / 100
  );
  const confidence =
    clusters.length < 2 || cohesion < 0.45 || largestShare > 0.6
      ? 'low'
      : cohesion < 0.7
        ? 'medium'
        : 'high';
  const note =
    clusters.length < 2
      ? 'The symbols do not fall apart into separate groups; split by responsibility, not by call structure.'
      : largestShare > 0.6
        ? 'One cluster still holds most of the code: split it further by responsibility before moving files.'
        : confidence === 'low'
          ? 'Clusters are weakly separated (many cross-cluster calls); treat them as a starting point and check each seam.'
          : 'Move each cluster to its own file; keep shared helpers in the original file or a small shared file, and update imports.';

  return {
    file: displayPath,
    language: graph.language,
    lineCount: graph.lineCount,
    symbolCount: symbols.length,
    confidence,
    cohesion,
    coverage,
    sharedHelpers,
    heaviest: [...symbols]
      .sort((a, b) => b.lineCount - a.lineCount)
      .slice(0, 3)
      .filter((symbol) => symbol.lineCount >= 40)
      .map((symbol) => ({ name: symbol.name, kind: symbol.kind, lines: symbol.lineCount })),
    orchestrators: [...orchestrators].map((index) => symbols[index].name),
    clusters,
    note,
  };
};
