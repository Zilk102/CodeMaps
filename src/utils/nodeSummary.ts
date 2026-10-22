import type { GraphData, GraphNode } from '../types/graph';

export interface NeighbourSummary {
  node: GraphNode;
  /** Number of individual links behind this neighbour (symbols count separately). */
  links: number;
}

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

/**
 * Explains a node in plain terms: who uses it and what it depends on. Symbols inside a
 * file count towards the file, and neighbours are folded to their file so the lists stay
 * short enough for a person to read.
 */
export const summarizeNode = (graph: GraphData, node: GraphNode, limit = 8): NodeSummary => {
  const nodeIndex = new Map(graph.nodes.map((item) => [item.id, item]));
  const fileOf = (id: string) => (nodeIndex.has(id.split('#')[0]) ? id.split('#')[0] : id);
  const ownFile = fileOf(node.id);
  const ownIds = new Set([node.id]);
  if (node.type === 'file' || node.type === 'directory') {
    graph.nodes.forEach((item) => {
      if (
        item.id.startsWith(`${node.id}#`) ||
        (node.type === 'directory' && item.id.startsWith(`${node.id}/`))
      ) {
        ownIds.add(item.id);
      }
    });
  }

  const usedBy = new Map<string, number>();
  const dependsOn = new Map<string, number>();

  for (const link of graph.links) {
    if (isStructural(link.type)) continue;
    const source = linkEnd(link.source);
    const target = linkEnd(link.target);
    const sourceInside = ownIds.has(source);
    const targetInside = ownIds.has(target);
    if (sourceInside === targetInside) continue;

    if (targetInside) {
      const other = fileOf(source);
      if (other !== ownFile) usedBy.set(other, (usedBy.get(other) ?? 0) + 1);
    } else {
      const other = fileOf(target);
      if (other !== ownFile) dependsOn.set(other, (dependsOn.get(other) ?? 0) + 1);
    }
  }

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
