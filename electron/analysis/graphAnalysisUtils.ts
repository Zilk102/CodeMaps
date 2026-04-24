import { GraphData, GraphLink, GraphNode } from '../store';

export interface GraphAdjacency {
  nodeById: Map<string, GraphNode>;
  incomingByTarget: Map<string, GraphLink[]>;
  outgoingBySource: Map<string, GraphLink[]>;
  childrenByParentId: Map<string, GraphNode[]>;
}

export const buildGraphAdjacency = (graph: GraphData): GraphAdjacency => {
  const nodeById = new Map(graph.nodes.map((node) => [node.id, node]));
  const incomingByTarget = new Map<string, GraphLink[]>();
  const outgoingBySource = new Map<string, GraphLink[]>();
  const childrenByParentId = new Map<string, GraphNode[]>();

  for (const node of graph.nodes) {
    if (!node.parentId) {
      continue;
    }

    const children = childrenByParentId.get(node.parentId) || [];
    children.push(node);
    childrenByParentId.set(node.parentId, children);
  }

  for (const link of graph.links) {
    const incoming = incomingByTarget.get(link.target) || [];
    incoming.push(link);
    incomingByTarget.set(link.target, incoming);

    const outgoing = outgoingBySource.get(link.source) || [];
    outgoing.push(link);
    outgoingBySource.set(link.source, outgoing);
  }

  return {
    nodeById,
    incomingByTarget,
    outgoingBySource,
    childrenByParentId,
  };
};

export const hasKnownParent = (node: GraphNode, nodeById: Map<string, GraphNode>) => {
  return Boolean(node.parentId && nodeById.has(node.parentId));
};

export const getHierarchyDepth = (node: GraphNode, nodeById: Map<string, GraphNode>) => {
  let depth = 0;
  let current: GraphNode | undefined = node;
  const visited = new Set<string>();

  while (current?.parentId) {
    const parent = nodeById.get(current.parentId);
    if (!parent || visited.has(parent.id)) {
      break;
    }

    visited.add(parent.id);
    depth += 1;
    current = parent;
  }

  return depth;
};

export const shouldHaveDirectoryParent = (node: GraphNode, projectRoot: string) => {
  if (node.type !== 'file' && node.type !== 'adr') {
    return false;
  }

  const normalizedProjectRoot = projectRoot.replace(/\\/g, '/');
  const normalizedId = node.id.replace(/\\/g, '/');
  const lastSlashIndex = normalizedId.lastIndexOf('/');

  if (lastSlashIndex === -1) {
    return false;
  }

  const parentPath = normalizedId.slice(0, lastSlashIndex);
  return parentPath !== normalizedProjectRoot;
};
