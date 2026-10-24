import type { SymbolInfo } from './types';
import { tokenize } from './clusterTokens';

const TOKEN_EDGE_WEIGHT = 0.5;
const DATA_EDGE_WEIGHT = 0.4;
const MAX_TOKEN_GROUP = 40;

export type WeightedGraph = Array<Map<number, number>>;

export const addEdge = (graph: WeightedGraph, a: number, b: number, weight: number) => {
  if (a === b) return;
  graph[a].set(b, (graph[a].get(b) ?? 0) + weight);
  graph[b].set(a, (graph[b].get(a) ?? 0) + weight);
};

const groupMembersByFeature = (members: number[], featuresOf: string[][]) => {
  const membersByFeature = new Map<string, number[]>();
  for (const index of members) {
    for (const feature of new Set(featuresOf[index])) {
      const bucket = membersByFeature.get(feature);
      if (bucket) bucket.push(index);
      else membersByFeature.set(feature, [index]);
    }
  }
  return membersByFeature;
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
  const membersByFeature = groupMembersByFeature(members, featuresOf);
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
export const addTokenEdges = (
  graph: WeightedGraph,
  members: number[],
  tokensOf: string[][],
  maxShareRatio: number
) => addSharedFeatureEdges(graph, members, tokensOf, maxShareRatio, TOKEN_EDGE_WEIGHT);

/** Symbols that touch the same fields, types and functions of other files work on the same data. */
export const addDataEdges = (graph: WeightedGraph, members: number[], usesOf: string[][]) =>
  addSharedFeatureEdges(graph, members, usesOf, 0.2, DATA_EDGE_WEIGHT);

/** What every step of the plan needs to know about the file. */
export interface Analysis {
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

export const emptyGraph = (size: number): WeightedGraph =>
  Array.from({ length: size }, () => new Map<number, number>());

export const indexRange = (size: number) => Array.from({ length: size }, (_, index) => index);

export const buildReferences = (symbols: SymbolInfo[]): Array<Set<number>> => {
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
export const classifyRoles = (symbols: SymbolInfo[], references: Array<Set<number>>) => {
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
export const buildAffinity = (
  symbols: SymbolInfo[],
  references: Array<Set<number>>,
  roles: ReturnType<typeof classifyRoles>
) => {
  const { active } = roles;
  const weighted = emptyGraph(symbols.length);
  const referenceWeighted = emptyGraph(symbols.length);
  addCallEdges(references, roles, [weighted, referenceWeighted]);

  const tokensOf = symbols.map((symbol) => tokenize(symbol.name));
  const documentFrequency = countDocumentFrequency(active, tokensOf);
  addTokenEdges(weighted, active, tokensOf, 0.25);
  const usesOf = symbols.map((symbol) => symbol.uses ?? []);
  addDataEdges(weighted, active, usesOf);
  return { weighted, referenceWeighted, tokensOf, usesOf, documentFrequency };
};

/** Mutual calls pull harder than one-way calls; hubs and orchestrators do not attract. */
const addCallEdges = (
  references: Array<Set<number>>,
  roles: ReturnType<typeof classifyRoles>,
  targets: WeightedGraph[]
) => {
  const { hubs, orchestrators, active } = roles;
  for (const from of active) {
    const callees = [...references[from]].filter((to) => !hubs.has(to) && !orchestrators.has(to));
    for (const to of callees) {
      const weight = references[to].has(from) ? 1.5 : 1;
      for (const graph of targets) addEdge(graph, from, to, weight);
    }
  }
};

const countDocumentFrequency = (active: number[], tokensOf: string[][]) => {
  const documentFrequency = new Map<string, number>();
  for (const index of active) {
    for (const token of new Set(tokensOf[index])) {
      documentFrequency.set(token, (documentFrequency.get(token) ?? 0) + 1);
    }
  }
  return documentFrequency;
};
