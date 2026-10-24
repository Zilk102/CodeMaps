import type { SplitPlan, SymbolGraph } from './types';
import type { Analysis } from './clusterEdges';
import { buildAffinity, buildReferences, classifyRoles, indexRange } from './clusterEdges';
import { partition } from './clusterCommunities';
import {
  adviceFor,
  describeClusters,
  heaviestSymbols,
  measureCohesion,
  rateConfidence,
} from './clusterPlan';

const MIN_SYMBOLS = 6;
const MAX_LISTED_SYMBOLS = 15;
const MAX_SHARED_LISTED = 10;

type Roles = ReturnType<typeof classifyRoles>;

/** The most used shared helpers, the ones every cluster depends on. */
const listSharedHelpers = (
  symbols: SymbolGraph['symbols'],
  roles: Roles
): SplitPlan['sharedHelpers'] =>
  [...roles.hubs]
    .sort((a, b) => roles.referrers[b].size - roles.referrers[a].size)
    .slice(0, MAX_SHARED_LISTED)
    .map((hub) => ({
      name: symbols[hub].name,
      kind: symbols[hub].kind,
      usedBy: roles.referrers[hub].size,
      lines: symbols[hub].lineCount,
    }));

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
    sharedHelpers: listSharedHelpers(symbols, roles),
    heaviest: heaviestSymbols(symbols),
    orchestrators: [...roles.orchestrators].map((index) => symbols[index].name),
    clusters,
    note: adviceFor(clusters.length, largestShare, confidence),
  };
};
