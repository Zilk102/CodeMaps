/** Read-only queries over the graph for MCP tools: node reference resolution, dependency lookup and search. */

import * as path from 'path';
import type { GraphData } from '../store';

/** A file linked to a node and how many graph links connect them. */
export interface NeighbourFile {
  file: string;
  links: number;
}

const DEFAULT_DEPENDENCY_LIMIT = 25;

const relativeToRoot = (root: string | undefined, id: string) => {
  const normalizedRoot = (root ?? '').replace(/\\/g, '/').replace(/\/$/, '');
  const normalized = id.replace(/\\/g, '/');
  return normalizedRoot && normalized.toLowerCase().startsWith(`${normalizedRoot.toLowerCase()}/`)
    ? normalized.slice(normalizedRoot.length + 1)
    : normalized;
};

/** Drive-letter paths are absolute on every platform; graph ids use them on Windows. */
const isAbsoluteReference = (value: string) => path.isAbsolute(value) || /^[A-Za-z]:\//.test(value);

/**
 * Agents often pass `internal/app/main.go` instead of the absolute node id. A path relative to
 * the project root (optionally with `./` and a `#symbol`) is mapped to the id the graph uses;
 * anything else is returned unchanged so the caller reports it as not found.
 */
export const resolveNodeReference = (graph: GraphData, reference: string): string => {
  const normalized = reference.replace(/\\/g, '/');
  if (graph.nodes.some((node) => node.id === normalized)) return normalized;

  const root = (graph.projectRoot ?? '').replace(/\/$/, '');
  const relative = normalized.replace(/^\.\//, '');
  if (!root || isAbsoluteReference(relative)) return normalized;

  const candidate = `${root}/${relative}`;
  if (graph.nodes.some((node) => node.id === candidate)) return candidate;
  const lowered = candidate.toLowerCase();
  return graph.nodes.find((node) => node.id.toLowerCase() === lowered)?.id ?? normalized;
};

/** The same mapping for a file that may not be a graph node (for tools that read the file). */
export const resolveProjectFilePath = (graph: GraphData, filePath: string): string => {
  const normalized = filePath.replace(/\\/g, '/');
  if (isAbsoluteReference(normalized) || !graph.projectRoot) return normalized;
  return `${graph.projectRoot.replace(/\/$/, '')}/${normalized.replace(/^\.\//, '')}`;
};

type GraphLink = GraphData['links'][number];

/** Tells whether a link end belongs to the node; a file node also owns its `file#symbol` ids. */
const ownershipOf = (nodeId: string, isFile: boolean) => {
  const memberPrefix = isFile ? `${nodeId}#` : null;
  return (id: string) => id === nodeId || (memberPrefix !== null && id.startsWith(memberPrefix));
};

/** Every neighbouring file once, with how many links tie it to the node. */
const summarizeNeighbours = (
  graph: GraphData,
  nodeId: string,
  links: GraphLink[],
  pick: (link: GraphLink) => string
): NeighbourFile[] => {
  const counts = new Map<string, number>();
  for (const link of links) {
    if (link.type === 'structure') continue;
    const file = pick(link).split('#')[0];
    if (file === nodeId.split('#')[0]) continue;
    counts.set(file, (counts.get(file) ?? 0) + 1);
  }
  return Array.from(counts.entries())
    .map(([file, linkCount]): NeighbourFile => ({
      file: relativeToRoot(graph.projectRoot, file),
      links: linkCount,
    }))
    .sort((a, b) => b.links - a.links || a.file.localeCompare(b.file));
};

/**
 * Links around a node. A file node also covers its own symbols, because imports point at
 * `file#symbol`; without that a file would wrongly look unused. The per-file summaries list
 * every neighbouring file once with how many links tie it to the node.
 */
export const getNodeDependencies = (
  graph: GraphData,
  nodeId: string,
  limit = DEFAULT_DEPENDENCY_LIMIT
) => {
  const isFile = graph.nodes.find((candidate) => candidate.id === nodeId)?.type === 'file';
  const isOwn = ownershipOf(nodeId, isFile);
  // A file's own symbols linking to each other are internal, not dependencies.
  const crossesBoundary = (inside: string, outside: string) =>
    isOwn(inside) && (!isFile || !isOwn(outside));

  const allDependencies = graph.links.filter((link) => crossesBoundary(link.source, link.target));
  const allDependents = graph.links.filter((link) => crossesBoundary(link.target, link.source));

  return {
    dependencyFiles: summarizeNeighbours(graph, nodeId, allDependencies, (link) => link.target),
    dependentFiles: summarizeNeighbours(graph, nodeId, allDependents, (link) => link.source),
    dependenciesTotal: allDependencies.length,
    dependentsTotal: allDependents.length,
    dependencies: allDependencies.slice(0, limit),
    dependents: allDependents.slice(0, limit),
  };
};

const matchRank = (node: GraphData['nodes'][number], query: string) => {
  const label = node.label.toLowerCase();
  if (label === query) return 0;
  if (label.startsWith(query)) return 1;
  if (label.includes(query)) return 2;
  // The path of a file matches every symbol inside it, which is noise; only files and
  // folders are worth finding by path.
  return node.id.includes('#') ? null : node.id.toLowerCase().includes(query) ? 3 : null;
};

/** Best matches first: exact name, then prefix, then substring, then path-only. */
export const searchGraph = (graph: GraphData, query: string, type?: string, limit = 20) => {
  const normalizedQuery = query.trim().toLowerCase();
  const candidates = graph.nodes.filter((node) => !type || node.type === type);

  if (!normalizedQuery) {
    return candidates.slice(0, limit);
  }

  return candidates
    .flatMap((node) => {
      const rank = matchRank(node, normalizedQuery);
      return rank === null ? [] : [{ node, rank }];
    })
    .sort(
      (a, b) =>
        a.rank - b.rank ||
        a.node.label.length - b.node.label.length ||
        a.node.id.localeCompare(b.node.id)
    )
    .slice(0, limit)
    .map((entry) => entry.node);
};
