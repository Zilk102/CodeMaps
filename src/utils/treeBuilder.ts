// Turns the flat graph node list into the filtered parent/child tree used by the file explorer.
import type { GraphLink, GraphNode } from '../types/graph';

/** A node of the explorer tree: the graph node and its visible children. */
export interface TreeNode {
  data: GraphNode;
  children: TreeNode[];
}

/** Visibility switches for the explorer tree (the graph filters without the edge flag). */
export interface TreeFilters {
  showDirectories: boolean;
  showFiles: boolean;
  showFunctions: boolean;
  showClasses: boolean;
  showADR: boolean;
}

const FILTER_BY_TYPE: Record<string, keyof TreeFilters> = {
  directory: 'showDirectories',
  file: 'showFiles',
  function: 'showFunctions',
  class: 'showClasses',
  adr: 'showADR',
};

/** True when the node's type is switched off by the visibility filters. */
export const isNodeHidden = (node: GraphNode, filters: TreeFilters): boolean => {
  const key = FILTER_BY_TYPE[node.type];
  return key !== undefined && !filters[key];
};

/** True when following parentId from this node leads back to itself or loops. */
export const hasParentCycle = (node: GraphNode, nodes: GraphNode[]): boolean => {
  let curr: string | undefined = node.parentId;
  const visited = new Set<string>();
  while (curr) {
    if (curr === node.id || visited.has(curr)) return true;
    visited.add(curr);
    const currId: string = curr;
    curr = nodes.find((n) => n.id === currId)?.parentId;
  }
  return false;
};

const buildCleanParentMap = (nodes: GraphNode[]): Map<string, string> => {
  const cleanParentMap = new Map<string, string>();
  nodes.forEach((node) => {
    if (node.parentId && !hasParentCycle(node, nodes)) {
      cleanParentMap.set(node.id, node.parentId);
    }
  });
  return cleanParentMap;
};

/**
 * Builds the explorer forest from the flat node list: hidden kinds are dropped, nodes without a
 * visible parent become roots, and parent cycles are ignored. Returns an empty list when no graph
 * is loaded.
 */
export const buildTree = (
  graphData: { nodes: GraphNode[]; links: GraphLink[] } | null,
  filters: TreeFilters
): TreeNode[] => {
  if (!graphData) return [];

  const cleanParentMap = buildCleanParentMap(graphData.nodes);

  // Build tree from flat list, applying visibility filters during construction
  const nodeMap = new Map<string, TreeNode>();
  graphData.nodes.forEach((node) => {
    if (!isNodeHidden(node, filters)) {
      nodeMap.set(node.id, { data: node, children: [] });
    }
  });

  const roots: TreeNode[] = [];

  nodeMap.forEach((treeNode, id) => {
    const parentId = cleanParentMap.get(id);
    if (parentId && nodeMap.has(parentId)) {
      nodeMap.get(parentId)!.children.push(treeNode);
    } else {
      roots.push(treeNode);
    }
  });

  return roots;
};
