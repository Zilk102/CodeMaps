// Turns the clustered groups into the public plan: cluster names and file names, cohesion,
// confidence and advice.

import * as path from 'path';
import type { SplitCluster, SplitPlan, SymbolGraph, SymbolInfo } from './types';
import type { Analysis } from './clusterEdges';
import type { Group } from './clusterCommunities';
import { fileNameFor, simpleName } from './clusterTokens';

/**
 * Picks a name for a cluster from its most telling word, else from its largest symbol. Adds `_2`,
 * `_3`... until the name is not in `taken`, and records it there.
 */
const nameCluster = (
  members: number[],
  symbols: SymbolInfo[],
  tokensOf: string[][],
  documentFrequency: Map<string, number>,
  taken: Set<string>
): string => {
  const best = bestToken(members, tokensOf, documentFrequency) || fallbackName(members, symbols);
  let candidate = best;
  for (let suffix = 2; taken.has(candidate); suffix += 1) candidate = `${best}_${suffix}`;
  taken.add(candidate);
  return candidate;
};

/**
 * The word that best names a cluster: frequent among its members and rare in the rest of the file;
 * ties favour longer words. Empty when the members share no word.
 */
const bestToken = (
  members: number[],
  tokensOf: string[][],
  documentFrequency: Map<string, number>
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
  return best;
};

const fallbackName = (members: number[], symbols: SymbolInfo[]): string => {
  const largest = [...members].sort((a, b) => symbols[b].lineCount - symbols[a].lineCount)[0];
  return (
    simpleName(symbols[largest].name)
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '_') || 'part'
  );
};

/** How much of the call traffic between clustered symbols stays inside a cluster. */
export const measureCohesion = (analysis: Analysis, clusterOf: Map<number, number>): number => {
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

/** Which shared helpers a group calls, and how often it calls into each other group. */
const countOutgoingUse = (
  group: Group,
  groupIndex: number,
  analysis: Analysis,
  clusterOf: Map<number, number>
) => {
  const helperUse = new Map<number, number>();
  const talksTo = new Map<number, number>();
  const bump = (counts: Map<number, number>, key: number) =>
    counts.set(key, (counts.get(key) ?? 0) + 1);
  const targets = group.members.flatMap((member) => [...analysis.references[member]]);
  for (const to of targets) {
    const other = clusterOf.get(to);
    if (analysis.hubs.has(to)) bump(helperUse, to);
    else if (other !== undefined && other !== groupIndex) bump(talksTo, other);
  }
  return { helperUse, talksTo };
};

/**
 * Builds the public cluster entries: name, suggested file, line and symbol counts, the first
 * `listLimit` symbols, the shared helpers the cluster calls (at most 6) and the other clusters it
 * depends on, most used first.
 */
export const describeClusters = (
  analysis: Analysis,
  groups: Group[],
  clusterOf: Map<number, number>,
  graph: SymbolGraph,
  listLimit: number
): SplitCluster[] => {
  const { symbols, tokensOf, documentFrequency, linesOf } = analysis;
  const taken = new Set<string>();
  const names = groups.map((group) => {
    if (!group.misc) return nameCluster(group.members, symbols, tokensOf, documentFrequency, taken);
    taken.add('misc');
    return 'misc';
  });
  const extension = path.extname(graph.filePath);

  return groups.map((group, groupIndex) => {
    const ordered = [...group.members].sort((a, b) => symbols[a].startLine - symbols[b].startLine);
    const { helperUse, talksTo } = countOutgoingUse(group, groupIndex, analysis, clusterOf);
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

/**
 * Confidence that the split is clean: low with fewer than two clusters, cohesion below 0.45 or one
 * cluster holding over 60% of the lines; medium below 0.7 cohesion, otherwise high.
 */
export const rateConfidence = (
  clusterCount: number,
  cohesion: number,
  largestShare: number
): SplitPlan['confidence'] => {
  if (clusterCount < 2 || cohesion < 0.45 || largestShare > 0.6) return 'low';
  return cohesion < 0.7 ? 'medium' : 'high';
};

/**
 * One sentence of guidance matching the outcome: no real split, one dominant cluster, weakly
 * separated clusters, or a clean split.
 */
export const adviceFor = (
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

/**
 * Up to three largest symbols that span at least 40 lines; one huge function or table is often the
 * real problem.
 */
export const heaviestSymbols = (symbols: SymbolInfo[]): SplitPlan['heaviest'] =>
  [...symbols]
    .sort((a, b) => b.lineCount - a.lineCount)
    .slice(0, 3)
    .filter((symbol) => symbol.lineCount >= 40)
    .map((symbol) => ({ name: symbol.name, kind: symbol.kind, lines: symbol.lineCount }));
