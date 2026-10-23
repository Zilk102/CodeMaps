import type { ElkNode } from 'elkjs/lib/elk.bundled.js';
import type { GraphData, GraphFilters, GraphLink, GraphNode } from '../../types/graph';
import { elk } from './elkInstance';
import {
  buildLayoutResult,
  buildOrthogonalSections,
  createElkNode,
  normalizeFlatNodes,
} from './layoutShared';
import {
  sortNodesForLayout,
  type LayoutEdge,
  type LayoutNode,
  type LayoutResult,
} from './layoutTypes';

const getLinkNodeId = (nodeRef: string | GraphNode) =>
  typeof nodeRef === 'string' ? nodeRef : nodeRef.id;

const getOwningDependencyNodeId = (
  nodeId: string,
  nodeIndex: Map<string, GraphNode>
): string | undefined => {
  let currentId: string | undefined = nodeId;
  const visited = new Set<string>();

  while (currentId && !visited.has(currentId)) {
    visited.add(currentId);
    const currentNode = nodeIndex.get(currentId);
    if (!currentNode) {
      return currentId;
    }

    if (currentNode.type === 'file' || currentNode.type === 'adr') {
      return currentNode.id;
    }

    currentId = currentNode.parentId;
  }

  return undefined;
};

/** Owning visible [source, target] file ids of a link, or null when it is not drawable. */
const resolveVisibleEndpoints = (
  link: GraphLink,
  nodeIndex: Map<string, GraphNode>,
  visibleNodeIds: Set<string>
): [string, string] | null => {
  const source = getOwningDependencyNodeId(getLinkNodeId(link.source), nodeIndex);
  const target = getOwningDependencyNodeId(getLinkNodeId(link.target), nodeIndex);

  if (
    !source ||
    !target ||
    source === target ||
    !visibleNodeIds.has(source) ||
    !visibleNodeIds.has(target)
  ) {
    return null;
  }
  return [source, target];
};

const buildDependencyLayoutEdges = (
  graphData: GraphData,
  validNodes: Map<string, GraphNode>,
  nodeIndex: Map<string, GraphNode>,
  selectedNodeId?: string
) => {
  const visibleNodeIds = new Set(validNodes.keys());
  const dedupe = new Set<string>();
  const layoutEdges: Array<{ id: string; sources: string[]; targets: string[]; data: GraphLink }> =
    [];
  const focusedNodeIds = new Set<string>();

  const collapsedSelectedId = selectedNodeId
    ? getOwningDependencyNodeId(selectedNodeId, nodeIndex)
    : undefined;

  graphData.links.forEach((link, idx) => {
    const endpoints = resolveVisibleEndpoints(link, nodeIndex, visibleNodeIds);
    if (!endpoints) {
      return;
    }
    const [visibleSourceId, visibleTargetId] = endpoints;

    const edgeKey = `${visibleSourceId}->${visibleTargetId}:${link.type || 'default'}`;
    if (dedupe.has(edgeKey)) {
      return;
    }
    dedupe.add(edgeKey);

    layoutEdges.push({
      id: `dep-${idx}`,
      sources: [visibleSourceId],
      targets: [visibleTargetId],
      data: link,
    });

    if (
      collapsedSelectedId &&
      (visibleSourceId === collapsedSelectedId || visibleTargetId === collapsedSelectedId)
    ) {
      focusedNodeIds.add(collapsedSelectedId);
      focusedNodeIds.add(visibleSourceId);
      focusedNodeIds.add(visibleTargetId);
    }
  });

  return {
    dependencyEdges: layoutEdges,
    focusedNodeIds,
    collapsedSelectedId,
  };
};

// Above this many nodes the layered layout trades a little polish for speed.
const LARGE_DEPENDENCY_GRAPH = 80;

const collectDependencyNodes = (graphData: GraphData, filters: GraphFilters) => {
  const validNodes = new Map<string, GraphNode>();
  graphData.nodes.forEach((node) => {
    if ((node.type === 'file' && filters.showFiles) || (node.type === 'adr' && filters.showADR)) {
      validNodes.set(node.id, node);
    }
  });
  return validNodes;
};

type DependencyLayoutEdge = ReturnType<
  typeof buildDependencyLayoutEdges
>['dependencyEdges'][number];

/** ELK input for the dependency view; a focused selection narrows it to the selection's neighbourhood. */
export const buildDependencyElkGraph = (
  validNodes: Map<string, GraphNode>,
  dependencyEdges: DependencyLayoutEdge[],
  focusedNodeIds: Set<string>,
  hasFocusedSelection: boolean
) => {
  const dependencyNodes = Array.from(validNodes.values())
    .filter((node) => !hasFocusedSelection || focusedNodeIds.has(node.id))
    .sort(sortNodesForLayout)
    .map((node) => createElkNode(node, 'dependencies'));

  return {
    id: 'dependency-root',
    layoutOptions: {
      'elk.algorithm': dependencyEdges.length > 0 ? 'layered' : 'box',
      'elk.direction': 'RIGHT',
      'elk.edgeRouting': 'POLYLINE',
      // NETWORK_SIMPLEX placement made the whole-project overview (200+ files) block the UI for
      // ~9 s; Brandes-Koepf is near-instant and visually equivalent for these graphs.
      'elk.layered.nodePlacement.strategy': 'BRANDES_KOEPF',
      'elk.layered.crossingMinimization.strategy': 'LAYER_SWEEP',
      'elk.layered.thoroughness': dependencyNodes.length > LARGE_DEPENDENCY_GRAPH ? '1' : '5',
      'elk.layered.spacing.nodeNodeBetweenLayers': hasFocusedSelection ? '140' : '110',
      'elk.layered.spacing.edgeNodeBetweenLayers': '70',
      'elk.spacing.nodeNode': hasFocusedSelection ? '80' : '56',
      'elk.spacing.componentComponent': '120',
      'elk.padding': '[top=40,left=40,bottom=40,right=40]',
    },
    children: dependencyNodes,
    edges: dependencyEdges
      .filter(
        (edge) =>
          !hasFocusedSelection ||
          (focusedNodeIds.has(edge.sources[0]) && focusedNodeIds.has(edge.targets[0]))
      )
      .map((edge) => ({
        id: edge.id,
        sources: edge.sources,
        targets: edge.targets,
      })),
  };
};

const toDependencyLayoutNodes = (
  layouted: ElkNode,
  validNodes: Map<string, GraphNode>
): LayoutNode[] =>
  (layouted.children || []).map((node: ElkNode) => ({
    id: node.id || '',
    x: node.x || 0,
    y: node.y || 0,
    width: node.width || 0,
    height: node.height || 0,
    data: validNodes.get(node.id || '')!,
    isContainer: false,
  }));

const toDependencyLayoutEdges = (
  layouted: ElkNode,
  nodeLayoutIndex: Map<string, LayoutNode>,
  edgeDataById: Map<string, GraphLink>
): LayoutEdge[] =>
  (layouted.edges || []).flatMap(
    (edge: NonNullable<ElkNode['edges']>[0] & { sources?: string[]; targets?: string[] }) => {
      const sourceId = edge.sources?.[0];
      const targetId = edge.targets?.[0];
      const sourceNode = nodeLayoutIndex.get(sourceId);
      const targetNode = nodeLayoutIndex.get(targetId);
      const edgeData = edgeDataById.get(edge.id);
      if (!sourceNode || !targetNode || !edgeData) {
        return [];
      }

      return [
        {
          id: edge.id,
          sections: buildOrthogonalSections(sourceNode, targetNode),
          data: edgeData,
          sourceId,
          targetId,
        },
      ];
    }
  );

export const runDependencyLayout = async (
  graphData: GraphData,
  filters: GraphFilters,
  selectedNodeId?: string
): Promise<LayoutResult> => {
  const nodeIndex = new Map(graphData.nodes.map((node) => [node.id, node]));
  const validNodes = collectDependencyNodes(graphData, filters);

  const { dependencyEdges, focusedNodeIds, collapsedSelectedId } = buildDependencyLayoutEdges(
    graphData,
    validNodes,
    nodeIndex,
    selectedNodeId
  );

  const hasFocusedSelection = Boolean(collapsedSelectedId && focusedNodeIds.size > 1);
  const graph = buildDependencyElkGraph(
    validNodes,
    dependencyEdges,
    focusedNodeIds,
    hasFocusedSelection
  );

  const layouted: ElkNode = await elk.layout(graph as ElkNode);
  const flatNodes = toDependencyLayoutNodes(layouted, validNodes);
  normalizeFlatNodes(flatNodes);

  const nodeLayoutIndex = new Map(flatNodes.map((node) => [node.id, node]));
  const edgeDataById = new Map(dependencyEdges.map((edge) => [edge.id, edge.data]));
  const flatEdges = filters.showEdges
    ? toDependencyLayoutEdges(layouted, nodeLayoutIndex, edgeDataById)
    : [];

  return buildLayoutResult(flatNodes, flatEdges, layouted);
};
