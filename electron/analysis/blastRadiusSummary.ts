import { isTestFile } from './testFiles';
import { GraphData } from '../store/types';
import { BlastRadiusResult } from './BlastRadiusAnalyzer';

export interface BlastRadiusFileEntry {
  file: string;
  /** Number of links that tie this file to the changed node. */
  links?: number;
  depth?: number;
  test: boolean;
}

export interface BlastRadiusAreaEntry {
  area: string;
  direct: number;
  transitive: number;
  tests: number;
}

export interface BlastRadiusSummary {
  nodeId: string;
  label: string;
  depthLimit: number | null;
  maxDepth: number;
  confidence: BlastRadiusResult['confidence'];
  counts: {
    directFiles: number;
    transitiveFiles: number;
    testFiles: number;
    affectedNodes: number;
  };
  byArea: BlastRadiusAreaEntry[];
  directFiles: BlastRadiusFileEntry[];
  /** Nearest indirect dependents only; the full count is in `counts`. */
  transitiveFiles: BlastRadiusFileEntry[];
  omitted: { directFiles: number; transitiveFiles: number; areas: number };
}

const AREA_SEGMENTS = 2;
const MAX_AREAS = 20;

const fileOf = (nodeId: string) => nodeId.split('#')[0];
const relativeTo = (root: string, file: string) => {
  const normalizedRoot = root.replace(/\\/g, '/').replace(/\/$/, '').toLowerCase();
  const normalized = file.replace(/\\/g, '/');
  return normalized.toLowerCase().startsWith(`${normalizedRoot}/`)
    ? normalized.slice(normalizedRoot.length + 1)
    : normalized;
};

const areaOf = (relativePath: string) => {
  const parts = relativePath.split('/');
  return parts.length <= AREA_SEGMENTS
    ? parts.slice(0, -1).join('/') || '.'
    : parts.slice(0, AREA_SEGMENTS).join('/');
};

/** Distance of every dependent file from the changed node, following reverse links. */
const computeDepths = (result: BlastRadiusResult) => {
  const dependentsOf = new Map<string, string[]>();
  for (const link of result.affectedLinks) {
    const bucket = dependentsOf.get(link.target) ?? [];
    bucket.push(link.source);
    dependentsOf.set(link.target, bucket);
  }

  const seeds = result.seedNodeIds ?? [result.rootNodeId];
  const depths = new Map<string, number>(seeds.map((id) => [id, 0]));
  const queue = [...seeds];
  while (queue.length > 0) {
    const current = queue.shift()!;
    const depth = depths.get(current) ?? 0;
    for (const next of dependentsOf.get(current) ?? []) {
      if (depths.has(next)) continue;
      depths.set(next, depth + 1);
      queue.push(next);
    }
  }
  return depths;
};

const countDirectLinks = (result: BlastRadiusResult, rootFile: string) => {
  const seedIds = new Set(result.seedNodeIds ?? [result.rootNodeId]);
  const directLinks = new Map<string, number>();
  for (const link of result.affectedLinks) {
    if (!seedIds.has(link.target)) continue;
    const file = fileOf(link.source);
    if (file !== rootFile) directLinks.set(file, (directLinks.get(file) ?? 0) + 1);
  }
  return directLinks;
};

const nearestIndirectDepths = (
  result: BlastRadiusResult,
  rootFile: string,
  directLinks: Map<string, number>
) => {
  const depths = computeDepths(result);
  const indirectDepth = new Map<string, number>();
  for (const node of result.affectedNodes) {
    const file = fileOf(node.id);
    if (file === rootFile || directLinks.has(file)) continue;
    const depth = depths.get(node.id) ?? result.maxDepth;
    indirectDepth.set(file, Math.min(depth, indirectDepth.get(file) ?? Infinity));
  }
  return indirectDepth;
};

const sortEntries = (
  entries: BlastRadiusFileEntry[],
  rank: (entry: BlastRadiusFileEntry) => number,
  descending: boolean
) =>
  entries.sort(
    (a, b) =>
      Number(a.test) - Number(b.test) ||
      (descending ? rank(b) - rank(a) : rank(a) - rank(b)) ||
      a.file.localeCompare(b.file)
  );

const summarizeAreas = (direct: BlastRadiusFileEntry[], transitive: BlastRadiusFileEntry[]) => {
  const areas = new Map<string, BlastRadiusAreaEntry>();
  const bump = (entry: BlastRadiusFileEntry, kind: 'direct' | 'transitive') => {
    const area = areaOf(entry.file);
    const current = areas.get(area) ?? { area, direct: 0, transitive: 0, tests: 0 };
    current[kind] += 1;
    if (entry.test) current.tests += 1;
    areas.set(area, current);
  };
  direct.forEach((entry) => bump(entry, 'direct'));
  transitive.forEach((entry) => bump(entry, 'transitive'));

  return Array.from(areas.values()).sort(
    (a, b) => b.direct + b.transitive - (a.direct + a.transitive) || a.area.localeCompare(b.area)
  );
};

/**
 * Turns the raw node-level blast radius into what a person (or agent) actually reads:
 * files grouped by area, the direct dependents first, and only the nearest indirect ones.
 */
export const summarizeBlastRadius = (
  graph: GraphData,
  result: BlastRadiusResult,
  limit = 15
): BlastRadiusSummary => {
  const rootFile = fileOf(result.rootNodeId);
  const root = graph.projectRoot ?? '';
  const directLinks = countDirectLinks(result, rootFile);
  const indirectDepth = nearestIndirectDepths(result, rootFile, directLinks);

  const toEntry = (file: string, extra: Partial<BlastRadiusFileEntry>): BlastRadiusFileEntry => {
    const relative = relativeTo(root, file);
    return { file: relative, test: isTestFile(relative), ...extra };
  };

  const direct = sortEntries(
    Array.from(directLinks.entries()).map(([file, links]) => toEntry(file, { links })),
    (entry) => entry.links ?? 0,
    true
  );
  const transitive = sortEntries(
    Array.from(indirectDepth.entries()).map(([file, depth]) => toEntry(file, { depth })),
    (entry) => entry.depth ?? 0,
    false
  );
  const sortedAreas = summarizeAreas(direct, transitive);

  return {
    nodeId: result.rootNodeId,
    label: graph.nodes.find((node) => node.id === result.rootNodeId)?.label ?? result.rootNodeId,
    depthLimit: result.depthLimit,
    maxDepth: result.maxDepth,
    confidence: result.confidence,
    counts: {
      directFiles: direct.length,
      transitiveFiles: transitive.length,
      testFiles: [...direct, ...transitive].filter((entry) => entry.test).length,
      affectedNodes: result.affectedNodes.length,
    },
    byArea: sortedAreas.slice(0, MAX_AREAS),
    directFiles: direct.slice(0, limit),
    transitiveFiles: transitive.slice(0, limit),
    omitted: {
      directFiles: Math.max(0, direct.length - limit),
      transitiveFiles: Math.max(0, transitive.length - limit),
      areas: Math.max(0, sortedAreas.length - MAX_AREAS),
    },
  };
};
