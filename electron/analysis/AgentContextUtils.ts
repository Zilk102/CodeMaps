import { GraphData, GraphNode } from '../store/types';

export const toStructuralNodeId = (nodeId: string) => nodeId.split('#')[0];

export const NORMALIZED_CODE_NODE_TYPES = ['file', 'class', 'function', 'adr'];

export const getNodeTypePriority = (type: string) => {
  switch (type) {
    case 'function':
      return 6;
    case 'class':
      return 5;
    case 'file':
      return 4;
    case 'adr':
      return 3;
    case 'directory':
      return 1;
    default:
      return 2;
  }
};

export const scoreNodeMatch = (node: GraphNode, normalizedQuery: string) => {
  const normalizedLabel = node.label.toLowerCase();
  const normalizedId = node.id.toLowerCase();
  const structuralId = toStructuralNodeId(normalizedId);
  const basename = structuralId.split('/').pop() || structuralId;
  const basenameWithoutExtension = basename.replace(/\.[^.]+$/u, '');
  const structuralLabel = normalizedLabel.replace(/\.[^.]+$/u, '');
  const q = normalizedQuery;
  const matches: Array<[boolean, number]> = [
    [normalizedLabel === q, 140],
    [basename === q, 180],
    [basenameWithoutExtension === q, 220],
    [structuralLabel === q, 160],
    [[`/${q}`, `/${q}.ts`, `/${q}.tsx`].some((suffix) => normalizedId.endsWith(suffix)), 160],
    [normalizedLabel.startsWith(q), 60],
    [basename.startsWith(q), 80],
    [basenameWithoutExtension.startsWith(q), 100],
    [normalizedLabel.includes(q), 25],
    [normalizedId.includes(`/${q}`), 20],
  ];
  let score = matches.reduce((sum, [matched, weight]) => sum + (matched ? weight : 0), 0);

  score += getNodeTypePriority(node.type) * 10;
  if (NORMALIZED_CODE_NODE_TYPES.includes(node.type)) {
    score += 20;
  }

  return score;
};

export const searchGraph = (graph: GraphData, query: string, type?: string, limit = 20) => {
  const normalizedQuery = query.trim().toLowerCase();
  return graph.nodes
    .filter((node) => {
      if (type && node.type !== type) return false;
      if (!normalizedQuery) return true;
      return (
        node.label.toLowerCase().includes(normalizedQuery) ||
        node.id.toLowerCase().includes(normalizedQuery)
      );
    })
    .map((node) => ({
      node,
      score: scoreNodeMatch(node, normalizedQuery),
    }))
    .filter(({ score }) => score > 0)
    .sort(compareScoredNodes())
    .slice(0, limit)
    .map(({ node }) => node);
};

export interface ScoredNode {
  node: GraphNode;
  score: number;
}

/** Best score first, then the more specific node type, then the label alphabetically. */
export const compareScoredNodes =
  (typePriority: (type: string) => number = getNodeTypePriority) =>
  (a: ScoredNode, b: ScoredNode) =>
    b.score - a.score ||
    typePriority(b.node.type) - typePriority(a.node.type) ||
    a.node.label.localeCompare(b.node.label);

/**
 * Outgoing and incoming neighbours between structural (file-level) ids. Self links are dropped;
 * `acceptLink` lets a caller keep only some of the remaining links.
 */
export const buildCollapsedAdjacency = (
  graph: GraphData,
  acceptLink: (sourceId: string, targetId: string) => boolean = () => true
) => {
  const outgoing = new Map<string, string[]>();
  const incoming = new Map<string, string[]>();
  for (const link of graph.links) {
    const source = toStructuralNodeId(link.source);
    const target = toStructuralNodeId(link.target);
    if (source === target || !acceptLink(source, target)) continue;
    outgoing.set(source, unique([...(outgoing.get(source) || []), target]));
    incoming.set(target, unique([...(incoming.get(target) || []), source]));
  }
  return { outgoing, incoming };
};

export const promoteCodeTarget = (matches: GraphNode[], normalizedQuery: string) => {
  const current = matches[0];
  if (!current || current.type !== 'directory') {
    return null;
  }

  const preferred = matches.find(
    (candidate) =>
      NORMALIZED_CODE_NODE_TYPES.includes(candidate.type) &&
      matchesCodeTargetQuery(candidate, normalizedQuery)
  );

  return preferred || null;
};

const matchesCodeTargetQuery = (candidate: GraphNode, normalizedQuery: string) => {
  const structuralId = toStructuralNodeId(candidate.id.toLowerCase());
  const basename = structuralId.split('/').pop() || structuralId;
  const basenameWithoutExtension = basename.replace(/\.[^.]+$/u, '');
  const normalizedLabel = candidate.label.toLowerCase();

  return (
    basenameWithoutExtension === normalizedQuery ||
    basename === normalizedQuery ||
    normalizedLabel === normalizedQuery ||
    normalizedLabel.startsWith(normalizedQuery)
  );
};

export const createGraphSummary = (graph: GraphData) => {
  return {
    projectRoot: graph.projectRoot,
    nodesCount: graph.nodes.length,
    linksCount: graph.links.length,
    nodeTypes: graph.nodes.reduce<Record<string, number>>((acc, node) => {
      acc[node.type] = (acc[node.type] || 0) + 1;
      return acc;
    }, {}),
  };
};

export const unique = <T>(items: T[]) => Array.from(new Set(items));
