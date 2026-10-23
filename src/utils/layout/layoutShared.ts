import type { ElkNode } from 'elkjs/lib/elk.bundled.js';
import type { GraphData, GraphFilters, GraphNode, LayoutMode } from '../../types/graph';
import {
  PROJECT_ROOT_ID,
  type LayoutEdge,
  type LayoutNode,
  type LayoutResult,
} from './layoutTypes';

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

export const buildOrthogonalSections = (source: LayoutNode, target: LayoutNode) => {
  const sourceCenterX = source.x + source.width / 2;
  const sourceCenterY = source.y + source.height / 2;
  const targetCenterX = target.x + target.width / 2;
  const targetCenterY = target.y + target.height / 2;

  const horizontalDominant =
    Math.abs(targetCenterX - sourceCenterX) >= Math.abs(targetCenterY - sourceCenterY);

  if (horizontalDominant) {
    const sourceOnRight = targetCenterX >= sourceCenterX;
    const startPoint = {
      x: sourceOnRight ? source.x + source.width : source.x,
      y: sourceCenterY,
    };
    const endPoint = {
      x: sourceOnRight ? target.x : target.x + target.width,
      y: targetCenterY,
    };
    const midX = (startPoint.x + endPoint.x) / 2;

    return [
      {
        startPoint,
        bendPoints: [
          { x: midX, y: startPoint.y },
          { x: midX, y: endPoint.y },
        ],
        endPoint,
      },
    ];
  }

  const sourceOnBottom = targetCenterY >= sourceCenterY;
  const startPoint = {
    x: sourceCenterX,
    y: sourceOnBottom ? source.y + source.height : source.y,
  };
  const endPoint = {
    x: targetCenterX,
    y: sourceOnBottom ? target.y : target.y + target.height,
  };
  const midY = (startPoint.y + endPoint.y) / 2;

  return [
    {
      startPoint,
      bendPoints: [
        { x: startPoint.x, y: midY },
        { x: endPoint.x, y: midY },
      ],
      endPoint,
    },
  ];
};

export const isNodeHiddenByFilters = (node: GraphNode, filters: GraphFilters) => {
  if (node.type === 'directory' && !filters.showDirectories) return true;
  if (node.type === 'file' && !filters.showFiles) return true;
  if (node.type === 'function' && !filters.showFunctions) return true;
  if (node.type === 'class' && !filters.showClasses) return true;
  if (node.type === 'adr' && !filters.showADR) return true;
  return false;
};

export const getNodeDimensions = (node: GraphNode, mode: LayoutMode) => {
  if (mode === 'dependencies') {
    switch (node.type) {
      case 'directory':
        return { width: 220, height: 60 };
      case 'file':
        return { width: 230, height: 64 };
      case 'class':
        return { width: 180, height: 48 };
      case 'function':
        return { width: 170, height: 44 };
      case 'adr':
        return { width: 220, height: 58 };
      default:
        return { width: 210, height: 56 };
    }
  }

  const isMethod = node.id.includes('#');
  if (node.type === 'class') return { width: 170, height: 46 };
  if (node.type === 'function') return { width: 150, height: 40 };
  if (node.type === 'adr') return { width: 220, height: 54 };
  if (isMethod) return { width: 150, height: 40 };
  return { width: 200, height: 50 };
};

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

export const computeCanvasBounds = (nodes: LayoutNode[]) => {
  if (nodes.length === 0) {
    return { width: 0, height: 0 };
  }

  return {
    width: Math.max(...nodes.map((node) => node.x + node.width)) + 120,
    height: Math.max(...nodes.map((node) => node.y + node.height)) + 120,
  };
};

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
    width: Math.max(layouted.width || 0, canvasBounds.width),
    height: Math.max(layouted.height || 0, canvasBounds.height),
  };
};
