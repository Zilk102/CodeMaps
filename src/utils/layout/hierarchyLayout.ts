// Hierarchy view layout: nests nodes by folder and file structure with ELK's box algorithm, then
// routes link edges.
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
  orZero,
  resolveVisibleNodeId,
} from './layoutShared';
import {
  PROJECT_ROOT_ID,
  sortNodesForLayout,
  type LayoutEdge,
  type LayoutNode,
  type LayoutResult,
} from './layoutTypes';

type GraphLink = GraphData['links'][number];

const linkEndpointId = (end: GraphLink['source']) => (typeof end === 'string' ? end : end.id);

const touchesProjectRoot = (sourceId: string, targetId: string) =>
  sourceId === PROJECT_ROOT_ID || targetId === PROJECT_ROOT_ID;

/** Visible [source, target] ids of a link, or null when it is not drawn. */
const resolveRenderedEndpoints = (
  link: GraphLink,
  visibleNodeIds: Set<string>,
  nodeIndex: Map<string, GraphNode>,
  includeProjectRoot: boolean
): [string, string] | null => {
  const sourceId = resolveVisibleNodeId(linkEndpointId(link.source), visibleNodeIds, nodeIndex);
  const targetId = resolveVisibleNodeId(linkEndpointId(link.target), visibleNodeIds, nodeIndex);
  if (!sourceId || !targetId || sourceId === targetId) return null;
  if (includeProjectRoot && touchesProjectRoot(sourceId, targetId)) return null;
  return [sourceId, targetId];
};

/** Creates drawable edges for the graph links whose endpoints resolve to laid-out visible nodes. */
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
    const endpoints = resolveRenderedEndpoints(link, visibleNodeIds, nodeIndex, includeProjectRoot);
    if (!endpoints) return;
    const [sourceId, targetId] = endpoints;

    const sourceNode = nodeLayoutIndex.get(sourceId);
    const targetNode = nodeLayoutIndex.get(targetId);
    if (!sourceNode || !targetNode) return;

    renderedEdges.push({
      id: `e${idx}`,
      sections: buildOrthogonalSections(sourceNode, targetNode),
      data: link,
      sourceId,
      targetId,
    });
  });

  return renderedEdges;
};

const sortElkChildren = (children: ElkNode[], validNodes: Map<string, GraphNode>) => {
  children.sort((a: ElkNode, b: ElkNode) =>
    sortNodesForLayout(validNodes.get(a.id)!, validNodes.get(b.id)!)
  );
};

/** Id of the closest ancestor of `node` that is itself visible, if any. */
const nearestVisibleAncestorId = (
  node: GraphNode,
  validNodes: Map<string, GraphNode>,
  nodeIndex: Map<string, GraphNode>
) => {
  let parentId = node.parentId;
  while (parentId && !validNodes.has(parentId)) {
    parentId = nodeIndex.get(parentId)?.parentId;
  }
  return parentId;
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
    const elkNode = elkNodesMap.get(node.id)!;
    const parentId = nearestVisibleAncestorId(node, validNodes, nodeIndex);
    const parentElkNode = parentId ? elkNodesMap.get(parentId) : undefined;
    if (parentElkNode) {
      (parentElkNode.children ??= []).push(elkNode);
    } else {
      rootChildren.push(elkNode);
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

/**
 * Gives every leaf of the ELK tree the fixed size of its node kind; containers are sized by ELK
 * from their children.
 */
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

const CONTAINER_TYPES = new Set(['project', 'directory', 'file']);

/** Walks the laid-out ELK tree and returns every visible node with absolute coordinates. */
export const flattenElkTree = (
  layouted: ElkNode,
  validNodes: Map<string, GraphNode>
): LayoutNode[] => {
  const flatNodes: LayoutNode[] = [];
  const computeAbsolute = (node: ElkNode, absX: number, absY: number) => {
    const x = absX + orZero(node.x);
    const y = absY + orZero(node.y);
    const data = node.id ? validNodes.get(node.id) : undefined;

    if (data) {
      const { width, height } = node;
      flatNodes.push({
        id: node.id,
        x,
        y,
        width: orZero(width),
        height: orZero(height),
        data,
        isContainer: CONTAINER_TYPES.has(data.type),
      });
    }

    node.children?.forEach((c: ElkNode) => computeAbsolute(c, x, y));
  };

  layouted.children?.forEach((c: ElkNode) => computeAbsolute(c, 0, 0));
  return flatNodes;
};

/**
 * Computes the hierarchy layout: nested boxes under a project root node, with edges added only
 * when the edge filter is on.
 */
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
