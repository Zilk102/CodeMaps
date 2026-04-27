import { GraphData, GraphNode } from '../store';

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
  let score = 0;

  if (normalizedLabel === normalizedQuery) score += 140;
  if (basename === normalizedQuery) score += 180;
  if (basenameWithoutExtension === normalizedQuery) score += 220;
  if (structuralLabel === normalizedQuery) score += 160;
  if (
    normalizedId.endsWith(`/${normalizedQuery}`) ||
    normalizedId.endsWith(`/${normalizedQuery}.ts`) ||
    normalizedId.endsWith(`/${normalizedQuery}.tsx`)
  ) {
    score += 160;
  }
  if (normalizedLabel.startsWith(normalizedQuery)) score += 60;
  if (basename.startsWith(normalizedQuery)) score += 80;
  if (basenameWithoutExtension.startsWith(normalizedQuery)) score += 100;
  if (normalizedLabel.includes(normalizedQuery)) score += 25;
  if (normalizedId.includes(`/${normalizedQuery}`)) score += 20;

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
    .sort(
      (a, b) =>
        b.score - a.score ||
        getNodeTypePriority(b.node.type) - getNodeTypePriority(a.node.type) ||
        a.node.label.localeCompare(b.node.label)
    )
    .slice(0, limit)
    .map(({ node }) => node);
};

export const promoteCodeTarget = (matches: GraphNode[], normalizedQuery: string) => {
  const current = matches[0];
  if (!current || current.type !== 'directory') {
    return null;
  }

  const preferred = matches.find((candidate) => {
    if (!NORMALIZED_CODE_NODE_TYPES.includes(candidate.type)) {
      return false;
    }

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
  });

  return preferred || null;
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
