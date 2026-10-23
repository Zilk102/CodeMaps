import * as path from 'path';
import type { SplitCluster, SplitPlan, SymbolGraph, SymbolInfo } from './types';
import type { Analysis } from './clusterEdges';
import type { Group } from './clusterCommunities';
import { fileNameFor, simpleName } from './clusterTokens';

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

export const describeClusters = (
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

export const rateConfidence = (
  clusterCount: number,
  cohesion: number,
  largestShare: number
): SplitPlan['confidence'] => {
  if (clusterCount < 2 || cohesion < 0.45 || largestShare > 0.6) return 'low';
  return cohesion < 0.7 ? 'medium' : 'high';
};

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

export const heaviestSymbols = (symbols: SymbolInfo[]): SplitPlan['heaviest'] =>
  [...symbols]
    .sort((a, b) => b.lineCount - a.lineCount)
    .slice(0, 3)
    .filter((symbol) => symbol.lineCount >= 40)
    .map((symbol) => ({ name: symbol.name, kind: symbol.kind, lines: symbol.lineCount }));
