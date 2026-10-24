// Builds the plain-language summary of a node (who uses it, what it depends on) shown in the
// details panel.
import type { GraphData, GraphNode } from '../types/graph';

/** A neighbouring file together with the number of links that connect it to the summarised node. */
export interface NeighbourSummary {
  node: GraphNode;
  /** Number of individual links behind this neighbour (symbols count separately). */
  links: number;
}

/**
 * Display data for a node: its project-relative path, the strongest users and dependencies with
 * their full counts, and its export names.
 */
export interface NodeSummary {
  relativePath: string;
  usedBy: NeighbourSummary[];
  dependsOn: NeighbourSummary[];
  usedByTotal: number;
  dependsOnTotal: number;
  exportNames: string[];
}

const linkEnd = (end: string | GraphNode) => (typeof end === 'string' ? end : end.id);
const isStructural = (type?: string) => type === 'structure';
const MAX_EXPORTS = 12;

const toRelativePath = (root: string, id: string) => {
  const normalizedRoot = root.replace(/\\/g, '/').replace(/\/$/, '');
  const normalizedId = id.split('#')[0].replace(/\\/g, '/');
  return normalizedId.toLowerCase().startsWith(`${normalizedRoot.toLowerCase()}/`)
    ? normalizedId.slice(normalizedRoot.length + 1)
    : normalizedId;
};

/** Ids of the node itself plus, for files and directories, everything inside it. */
export const collectOwnIds = (nodes: GraphNode[], node: GraphNode): Set<string> => {
  const ownIds = new Set([node.id]);
  if (node.type === 'file' || node.type === 'directory') {
    nodes.forEach((item) => {
      if (
        item.id.startsWith(`${node.id}#`) ||
        (node.type === 'directory' && item.id.startsWith(`${node.id}/`))
      ) {
        ownIds.add(item.id);
      }
    });
  }
  return ownIds;
};

const bump = (counts: Map<string, number>, key: string) =>
  counts.set(key, (counts.get(key) ?? 0) + 1);

/** Counts, per outside file, how many links point into / out of the node. */
export const countNeighbourLinks = (
  links: GraphData['links'],
  ownIds: Set<string>,
  ownFile: string,
  fileOf: (id: string) => string
): { usedBy: Map<string, number>; dependsOn: Map<string, number> } => {
  const usedBy = new Map<string, number>();
  const dependsOn = new Map<string, number>();

  for (const link of links) {
    if (isStructural(link.type)) continue;
    const source = linkEnd(link.source);
    const target = linkEnd(link.target);
    const sourceInside = ownIds.has(source);
    if (sourceInside === ownIds.has(target)) continue;

    const incoming = !sourceInside;
    const other = fileOf(incoming ? source : target);
    if (other !== ownFile) bump(incoming ? usedBy : dependsOn, other);
  }
  return { usedBy, dependsOn };
};

/**
 * Explains a node in plain terms: who uses it and what it depends on. Symbols inside a
 * file count towards the file, and neighbours are folded to their file so the lists stay
 * short enough for a person to read.
 */
export const summarizeNode = (graph: GraphData, node: GraphNode, limit = 8): NodeSummary => {
  const nodeIndex = new Map(graph.nodes.map((item) => [item.id, item]));
  const fileOf = (id: string) => (nodeIndex.has(id.split('#')[0]) ? id.split('#')[0] : id);
  const ownFile = fileOf(node.id);
  const ownIds = collectOwnIds(graph.nodes, node);
  const { usedBy, dependsOn } = countNeighbourLinks(graph.links, ownIds, ownFile, fileOf);

  const rank = (counts: Map<string, number>): NeighbourSummary[] =>
    Array.from(counts.entries())
      .flatMap(([id, links]) => {
        const neighbour = nodeIndex.get(id);
        return neighbour ? [{ node: neighbour, links }] : [];
      })
      .sort((a, b) => b.links - a.links || a.node.label.localeCompare(b.node.label));

  const rankedUsedBy = rank(usedBy);
  const rankedDependsOn = rank(dependsOn);

  return {
    relativePath: toRelativePath(graph.projectRoot, node.id),
    usedBy: rankedUsedBy.slice(0, limit),
    dependsOn: rankedDependsOn.slice(0, limit),
    usedByTotal: rankedUsedBy.length,
    dependsOnTotal: rankedDependsOn.length,
    exportNames: (node.exports ?? []).map((record) => record.exportedName).slice(0, MAX_EXPORTS),
  };
};
