import type { ElkNode } from 'elkjs/lib/elk.bundled.js';
import type { GraphData, GraphFilters, GraphNode } from '../../types/graph';
import { elk } from './elkInstance';
import {
  buildLayoutResult,
  buildOrthogonalSections,
  buildVisibleContext,
  createElkNode,
  getNodeDimensions,
  normalizeFlatNodes,
  resolveVisibleNodeId,
} from './layoutShared';
import {
  PROJECT_ROOT_ID,
  sortNodesForLayout,
  type LayoutEdge,
  type LayoutNode,
  type LayoutResult,
} from './layoutTypes';

const buildRenderedEdges = (
  graphData: GraphData,
  validNodes: Map<string, GraphNode>,
  nodeIndex: Map<string, GraphNode>,
  nodeLayoutIndex: Map<string, LayoutNode>,
  includeProjectRoot: boolean
) => {
  const renderedEdges: LayoutEdge[] = [];
  const visibleNodeIds = new Set(validNodes.keys());

  graphData.links.forEach((link, idx) => {
    const sourceId = typeof link.source === 'string' ? link.source : link.source.id;
    const targetId = typeof link.target === 'string' ? link.target : link.target.id;

    const visibleSourceId = resolveVisibleNodeId(sourceId, visibleNodeIds, nodeIndex);
    const visibleTargetId = resolveVisibleNodeId(targetId, visibleNodeIds, nodeIndex);

    if (!visibleSourceId || !visibleTargetId || visibleSourceId === visibleTargetId) {
      return;
    }

    if (
      includeProjectRoot &&
      (visibleSourceId === PROJECT_ROOT_ID || visibleTargetId === PROJECT_ROOT_ID)
    ) {
      return;
    }

    const sourceNode = nodeLayoutIndex.get(visibleSourceId);
    const targetNode = nodeLayoutIndex.get(visibleTargetId);

    if (!sourceNode || !targetNode) {
      return;
    }

    renderedEdges.push({
      id: `e${idx}`,
      sections: buildOrthogonalSections(sourceNode, targetNode),
      data: link,
      sourceId: visibleSourceId,
      targetId: visibleTargetId,
    });
  });

  return renderedEdges;
};

const sortElkChildren = (children: ElkNode[], validNodes: Map<string, GraphNode>) => {
  children.sort((a: ElkNode, b: ElkNode) =>
    sortNodesForLayout(validNodes.get(a.id)!, validNodes.get(b.id)!)
  );
};

/** Nests every visible node under its nearest visible ancestor; the rest become roots. */
export const buildElkHierarchy = (
  validNodes: Map<string, GraphNode>,
  nodeIndex: Map<string, GraphNode>
) => {
  const elkNodesMap = new Map<string, ElkNode>();
  validNodes.forEach((node) => {
    elkNodesMap.set(node.id, createElkNode(node, 'hierarchy'));
  });

  const rootChildren: ElkNode[] = [];
  validNodes.forEach((node) => {
    if (node.id === PROJECT_ROOT_ID) return;
    const elkNode = elkNodesMap.get(node.id);
    let parentId = node.parentId;

    while (parentId && !validNodes.has(parentId)) {
      parentId = nodeIndex.get(parentId)?.parentId;
    }

    if (parentId && elkNodesMap.has(parentId)) {
      const parentElkNode = elkNodesMap.get(parentId);
      if (parentElkNode) {
        if (!parentElkNode.children) parentElkNode.children = [];
        if (elkNode) parentElkNode.children.push(elkNode);
      }
    } else {
      if (elkNode) rootChildren.push(elkNode);
    }
  });

  return { elkNodesMap, rootChildren };
};

/** Gives the project root and every container the box algorithm and a stable child order. */
const configureHierarchyContainers = (
  elkNodesMap: Map<string, ElkNode>,
  rootChildren: ElkNode[],
  validNodes: Map<string, GraphNode>
) => {
  const projectRootElkNode = elkNodesMap.get(PROJECT_ROOT_ID);
  if (projectRootElkNode) {
    projectRootElkNode.children = rootChildren;
    projectRootElkNode.layoutOptions = {
      ...projectRootElkNode.layoutOptions,
      'elk.algorithm': 'box',
      'elk.spacing.nodeNode': '64',
      'elk.padding': '[top=56,left=28,bottom=28,right=28]',
    };
  }

  // Stabilize the order of children inside containers so that layout doesn't depend on the set of visible edges.
  elkNodesMap.forEach((elkNode) => {
    if (!elkNode.children?.length) return;
    sortElkChildren(elkNode.children, validNodes);

    elkNode.layoutOptions = {
      ...elkNode.layoutOptions,
      'elk.algorithm': 'box',
      'elk.spacing.nodeNode': '28',
      'elk.padding': '[top=48,left=20,bottom=20,right=20]',
    };
  });
  sortElkChildren(rootChildren, validNodes);

  return projectRootElkNode;
};

const assignLeafDimensions = (node: ElkNode, validNodes: Map<string, GraphNode>) => {
  if (!node.children || (node.children as ElkNode[]).length === 0) {
    const sourceNode = validNodes.get(node.id);
    if (sourceNode) {
      const dimensions = getNodeDimensions(sourceNode, 'hierarchy');
      node.width = dimensions.width;
      node.height = dimensions.height;
    }
  } else {
    node.children.forEach((child) => assignLeafDimensions(child, validNodes));
  }
};

/** Walks the laid-out ELK tree and returns every visible node with absolute coordinates. */
export const flattenElkTree = (
  layouted: ElkNode,
  validNodes: Map<string, GraphNode>
): LayoutNode[] => {
  const flatNodes: LayoutNode[] = [];
  const computeAbsolute = (node: ElkNode, absX: number, absY: number) => {
    const x = absX + (node.x || 0);
    const y = absY + (node.y || 0);

    if (node.id && validNodes.has(node.id)) {
      flatNodes.push({
        id: node.id,
        x,
        y,
        width: node.width || 0,
        height: node.height || 0,
        data: validNodes.get(node.id)!,
        isContainer: ['project', 'directory', 'file'].includes(validNodes.get(node.id)!.type),
      });
    }

    if (node.children) {
      node.children.forEach((c: ElkNode) => computeAbsolute(c, x, y));
    }
  };

  layouted.children?.forEach((c: ElkNode) => computeAbsolute(c, 0, 0));
  return flatNodes;
};

export const runHierarchyLayout = async (
  graphData: GraphData,
  filters: GraphFilters
): Promise<LayoutResult> => {
  const { nodeIndex, validNodes } = buildVisibleContext(graphData, filters, true);
  const { elkNodesMap, rootChildren } = buildElkHierarchy(validNodes, nodeIndex);
  const projectRootElkNode = configureHierarchyContainers(elkNodesMap, rootChildren, validNodes);
  rootChildren.forEach((child) => assignLeafDimensions(child, validNodes));

  const graph = {
    id: 'root',
    layoutOptions: {
      'elk.algorithm': 'box',
      'elk.spacing.nodeNode': '56',
      'elk.spacing.componentComponent': '72',
      'elk.padding': '[top=24,left=24,bottom=24,right=24]',
    },
    children: projectRootElkNode ? [projectRootElkNode] : [],
    edges: [],
  };

  const layouted: ElkNode = await elk.layout(graph as ElkNode);
  const flatNodes = flattenElkTree(layouted, validNodes);
  normalizeFlatNodes(flatNodes);

  const nodeLayoutIndex = new Map(flatNodes.map((node) => [node.id, node]));
  const flatEdges = filters.showEdges
    ? buildRenderedEdges(graphData, validNodes, nodeIndex, nodeLayoutIndex, true)
    : [];

  return buildLayoutResult(flatNodes, flatEdges, layouted);
};
