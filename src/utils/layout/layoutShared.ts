// Helpers shared by both layout modes: node sizes, ELK node creation, edge routing, normalisation
// and canvas bounds.
import type { ElkNode } from 'elkjs/lib/elk.bundled.js';
import type { GraphData, GraphFilters, GraphNode, LayoutMode } from '../../types/graph';
import {
  PROJECT_ROOT_ID,
  type LayoutEdge,
  type LayoutNode,
  type LayoutResult,
} from './layoutTypes';

/**
 * Walks up parentId links until it finds a visible ancestor (or the node itself); undefined when
 * none is visible.
 */
export const resolveVisibleNodeId = (
  nodeId: string,
  visibleNodeIds: Set<string>,
  nodeIndex: Map<string, GraphNode>
) => {
  let currentId: string | undefined = nodeId;

  while (currentId && !visibleNodeIds.has(currentId)) {
    currentId = nodeIndex.get(currentId)?.parentId;
  }

  return currentId;
};

/** A missing or NaN measurement counts as 0. */
export const orZero = (value: number | undefined) => value || 0;

const centerOf = (node: LayoutNode) => ({
  x: node.x + node.width / 2,
  y: node.y + node.height / 2,
});

/**
 * Route for a mostly horizontal edge: leaves the facing side of the source, bends at the midpoint
 * and enters the facing side of the target.
 */
const horizontalSection = (source: LayoutNode, target: LayoutNode) => {
  const sourceCenter = centerOf(source);
  const targetCenter = centerOf(target);
  const sourceOnRight = targetCenter.x >= sourceCenter.x;
  const startPoint = { x: sourceOnRight ? source.x + source.width : source.x, y: sourceCenter.y };
  const endPoint = { x: sourceOnRight ? target.x : target.x + target.width, y: targetCenter.y };
  const midX = (startPoint.x + endPoint.x) / 2;
  const bendPoints = [
    { x: midX, y: startPoint.y },
    { x: midX, y: endPoint.y },
  ];
  return [{ startPoint, bendPoints, endPoint }];
};

/** Route for a mostly vertical edge, mirroring the horizontal one on the top and bottom sides. */
const verticalSection = (source: LayoutNode, target: LayoutNode) => {
  const sourceCenter = centerOf(source);
  const targetCenter = centerOf(target);
  const sourceOnBottom = targetCenter.y >= sourceCenter.y;
  const startPoint = { x: sourceCenter.x, y: sourceOnBottom ? source.y + source.height : source.y };
  const endPoint = { x: targetCenter.x, y: sourceOnBottom ? target.y : target.y + target.height };
  const midY = (startPoint.y + endPoint.y) / 2;
  const bendPoints = [
    { x: startPoint.x, y: midY },
    { x: endPoint.x, y: midY },
  ];
  return [{ startPoint, bendPoints, endPoint }];
};

/**
 * Builds a three-segment orthogonal route between two nodes, choosing horizontal or vertical by
 * which distance between their centres is larger.
 */
export const buildOrthogonalSections = (source: LayoutNode, target: LayoutNode) => {
  const sourceCenter = centerOf(source);
  const targetCenter = centerOf(target);
  const horizontalDominant =
    Math.abs(targetCenter.x - sourceCenter.x) >= Math.abs(targetCenter.y - sourceCenter.y);
  return horizontalDominant ? horizontalSection(source, target) : verticalSection(source, target);
};

const FILTER_FLAG_BY_TYPE: Partial<Record<string, keyof GraphFilters>> = {
  directory: 'showDirectories',
  file: 'showFiles',
  function: 'showFunctions',
  class: 'showClasses',
  adr: 'showADR',
};

/** True when the node's kind is switched off in the filters. */
export const isNodeHiddenByFilters = (node: GraphNode, filters: GraphFilters) => {
  const flag = FILTER_FLAG_BY_TYPE[node.type];
  return flag !== undefined && !filters[flag];
};

type NodeSize = { width: number; height: number };

const DEPENDENCY_SIZES: Partial<Record<string, NodeSize>> = {
  directory: { width: 220, height: 60 },
  file: { width: 230, height: 64 },
  class: { width: 180, height: 48 },
  function: { width: 170, height: 44 },
  adr: { width: 220, height: 58 },
};
const DEFAULT_DEPENDENCY_SIZE: NodeSize = { width: 210, height: 56 };

const HIERARCHY_SIZES: Partial<Record<string, NodeSize>> = {
  class: { width: 170, height: 46 },
  function: { width: 150, height: 40 },
  adr: { width: 220, height: 54 },
};

/**
 * Fixed box size of a node by kind and layout mode; hierarchy mode makes symbol nodes (ids with
 * '#') smaller than files.
 */
export const getNodeDimensions = (node: GraphNode, mode: LayoutMode): NodeSize => {
  if (mode === 'dependencies') return DEPENDENCY_SIZES[node.type] ?? DEFAULT_DEPENDENCY_SIZE;

  const sized = HIERARCHY_SIZES[node.type];
  if (sized) return sized;
  return node.id.includes('#') ? { width: 150, height: 40 } : { width: 200, height: 50 };
};

/**
 * ELK node for a graph node, with its size, a label width estimated from the text length and
 * padding for its mode.
 */
export const createElkNode = (node: GraphNode, mode: LayoutMode) => ({
  id: node.id,
  width: getNodeDimensions(node, mode).width,
  height: getNodeDimensions(node, mode).height,
  labels: [{ text: node.label, width: Math.max(40, node.label.length * 8), height: 16 }],
  layoutOptions: {
    'elk.padding':
      mode === 'hierarchy'
        ? '[top=40,left=20,bottom=20,right=20]'
        : '[top=12,left=12,bottom=12,right=12]',
  },
});

/** Shifts all nodes in place so the top-left of the drawing sits at 0,0. */
export const normalizeFlatNodes = (nodes: LayoutNode[]) => {
  if (nodes.length === 0) {
    return;
  }

  const minX = Math.min(...nodes.map((node) => node.x));
  const minY = Math.min(...nodes.map((node) => node.y));

  if (minX !== 0 || minY !== 0) {
    nodes.forEach((node) => {
      node.x -= minX;
      node.y -= minY;
    });
  }
};

/** Width and height needed to contain every node plus a 120px margin (0 for an empty layout). */
export const computeCanvasBounds = (nodes: LayoutNode[]) => {
  if (nodes.length === 0) {
    return { width: 0, height: 0 };
  }

  return {
    width: Math.max(...nodes.map((node) => node.x + node.width)) + 120,
    height: Math.max(...nodes.map((node) => node.y + node.height)) + 120,
  };
};

/**
 * Prepares the filtered node set and id index; in hierarchy mode also adds a synthetic root node
 * named after the project folder.
 */
export const buildVisibleContext = (
  graphData: GraphData,
  filters: GraphFilters,
  includeProjectRoot: boolean
) => {
  const nodeIndex = new Map(graphData.nodes.map((node) => [node.id, node]));
  const validNodes = new Map<string, GraphNode>();

  graphData.nodes.forEach((node) => {
    if (!isNodeHiddenByFilters(node, filters)) {
      validNodes.set(node.id, node);
    }
  });

  if (includeProjectRoot) {
    const projectRootNode: GraphNode = {
      id: PROJECT_ROOT_ID,
      label:
        graphData.projectRoot.replace(/\\/g, '/').split('/').filter(Boolean).pop() || 'project',
      group: -1,
      type: 'project',
      churn: 0,
    };
    validNodes.set(PROJECT_ROOT_ID, projectRootNode);
  }

  return {
    nodeIndex,
    validNodes,
    visibleNodeIds: new Set(validNodes.keys()),
  };
};

/** Canvas size: the larger of what ELK reported and the nodes' extent plus margin. */
export const buildLayoutResult = (
  nodes: LayoutNode[],
  edges: LayoutEdge[],
  layouted: ElkNode
): LayoutResult => {
  const canvasBounds = computeCanvasBounds(nodes);

  return {
    nodes,
    edges,
    width: Math.max(orZero(layouted.width), canvasBounds.width),
    height: Math.max(orZero(layouted.height), canvasBounds.height),
  };
};
