// Types and ordering constants shared by the layout modules.
import type { GraphLink, GraphNode } from '../../types/graph';

/** A positioned node in canvas coordinates; isContainer marks nodes that visually hold others. */
export interface LayoutNode {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
  data: GraphNode;
  isContainer: boolean;
}

/**
 * A routed edge with its drawing sections (start, bends, end), the graph link it represents and
 * its endpoint ids.
 */
export interface LayoutEdge {
  id: string;
  sections: Array<{
    startPoint: { x: number; y: number };
    endPoint: { x: number; y: number };
    bendPoints?: Array<{ x: number; y: number }>;
  }>;
  data: GraphLink;
  sourceId: string;
  targetId: string;
}

/** Output of a layout run: nodes, edges and the overall canvas size. */
export interface LayoutResult {
  nodes: LayoutNode[];
  edges: LayoutEdge[];
  width: number;
  height: number;
}

export const PROJECT_ROOT_ID = '__project_root__';

export const TYPE_ORDER: Record<string, number> = {
  directory: 0,
  file: 1,
  class: 2,
  function: 3,
  adr: 4,
};

/**
 * Sort comparator that orders nodes by kind (directories, files, classes, functions, ADRs) and
 * then by label, to keep layouts stable.
 */
export const sortNodesForLayout = (a: GraphNode, b: GraphNode) => {
  const typeDiff = (TYPE_ORDER[a.type] ?? 99) - (TYPE_ORDER[b.type] ?? 99);
  if (typeDiff !== 0) return typeDiff;
  return a.label.localeCompare(b.label);
};
