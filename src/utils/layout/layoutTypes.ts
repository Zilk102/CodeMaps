import type { GraphLink, GraphNode } from '../../types/graph';

export interface LayoutNode {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
  data: GraphNode;
  isContainer: boolean;
}

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

export const sortNodesForLayout = (a: GraphNode, b: GraphNode) => {
  const typeDiff = (TYPE_ORDER[a.type] ?? 99) - (TYPE_ORDER[b.type] ?? 99);
  if (typeDiff !== 0) return typeDiff;
  return a.label.localeCompare(b.label);
};
