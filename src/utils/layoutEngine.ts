import ELK from 'elkjs/lib/elk.bundled.js';
import type { GraphData, GraphFilters, GraphLink, GraphNode, LayoutMode } from '../types/graph';

const elk = new ELK();

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
  sections: any[];
  data: any;
  sourceId: string;
  targetId: string;
}

export interface LayoutResult {
  nodes: LayoutNode[];
  edges: LayoutEdge[];
  width: number;
  height: number;
}

const PROJECT_ROOT_ID = '__project_root__';

const TYPE_ORDER: Record<string, number> = {
  directory: 0,
  file: 1,
  class: 2,
  function: 3,
  adr: 4,
};

const sortNodesForLayout = (a: GraphNode, b: GraphNode) => {
  const typeDiff = (TYPE_ORDER[a.type] ?? 99) - (TYPE_ORDER[b.type] ?? 99);
  if (typeDiff !== 0) return typeDiff;
  return a.label.localeCompare(b.label);
};

const resolveVisibleNodeId = (
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

const buildOrthogonalSections = (source: LayoutNode, target: LayoutNode) => {
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

const isNodeHiddenByFilters = (node: GraphNode, filters: GraphFilters) => {
  if (node.type === 'directory' && !filters.showDirectories) return true;
  if (node.type === 'file' && !filters.showFiles) return true;
  if (node.type === 'function' && !filters.showFunctions) return true;
  if (node.type === 'class' && !filters.showClasses) return true;
  if (node.type === 'adr' && !filters.showADR) return true;
  return false;
};

const getNodeDimensions = (node: GraphNode, mode: LayoutMode) => {
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

const createElkNode = (node: GraphNode, mode: LayoutMode) => ({
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

const normalizeFlatNodes = (nodes: LayoutNode[]) => {
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

const computeCanvasBounds = (nodes: LayoutNode[]) => {
  if (nodes.length === 0) {
    return { width: 0, height: 0 };
  }

  return {
    width: Math.max(...nodes.map((node) => node.x + node.width)) + 120,
    height: Math.max(...nodes.map((node) => node.y + node.height)) + 120,
  };
};

const buildVisibleContext = (
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

const runHierarchyLayout = async (
  graphData: GraphData,
  filters: GraphFilters
): Promise<LayoutResult> => {
  const { nodeIndex, validNodes } = buildVisibleContext(graphData, filters, true);
  const elkNodesMap = new Map<string, any>();
  validNodes.forEach((node) => {
    elkNodesMap.set(node.id, createElkNode(node, 'hierarchy'));
  });

  const rootChildren: any[] = [];
  validNodes.forEach((node) => {
    if (node.id === PROJECT_ROOT_ID) return;
    const elkNode = elkNodesMap.get(node.id);
    let parentId = node.parentId;

    while (parentId && !validNodes.has(parentId)) {
      parentId = nodeIndex.get(parentId)?.parentId;
    }

    if (parentId && elkNodesMap.has(parentId)) {
      const parentElkNode = elkNodesMap.get(parentId);
      if (!parentElkNode.children) parentElkNode.children = [];
      parentElkNode.children.push(elkNode);
    } else {
      rootChildren.push(elkNode);
    }
  });

  const projectRootElkNode = elkNodesMap.get(PROJECT_ROOT_ID);
  projectRootElkNode.children = rootChildren;
  projectRootElkNode.layoutOptions = {
    ...projectRootElkNode.layoutOptions,
    'elk.algorithm': 'box',
    'elk.spacing.nodeNode': '64',
    'elk.padding': '[top=56,left=28,bottom=28,right=28]',
  };

  // Стабилизируем порядок детей внутри контейнеров, чтобы layout не зависел от набора видимых связей.
  elkNodesMap.forEach((elkNode) => {
    if (!elkNode.children?.length) return;
    elkNode.children.sort((a: any, b: any) => {
      const nodeA = validNodes.get(a.id)!;
      const nodeB = validNodes.get(b.id)!;
      return sortNodesForLayout(nodeA, nodeB);
    });

    elkNode.layoutOptions = {
      ...elkNode.layoutOptions,
      'elk.algorithm': 'box',
      'elk.spacing.nodeNode': '28',
      'elk.padding': '[top=48,left=20,bottom=20,right=20]',
    };
  });
  rootChildren.sort((a, b) => {
    const nodeA = validNodes.get(a.id)!;
    const nodeB = validNodes.get(b.id)!;
    return sortNodesForLayout(nodeA, nodeB);
  });

  const assignDimensions = (node: any) => {
    if (!node.children || node.children.length === 0) {
      const sourceNode = validNodes.get(node.id);
      if (sourceNode) {
        const dimensions = getNodeDimensions(sourceNode, 'hierarchy');
        node.width = dimensions.width;
        node.height = dimensions.height;
      }
    } else {
      node.children.forEach(assignDimensions);
    }
  };
  rootChildren.forEach(assignDimensions);

  const graph = {
    id: 'root',
    layoutOptions: {
      'elk.algorithm': 'box',
      'elk.spacing.nodeNode': '56',
      'elk.spacing.componentComponent': '72',
      'elk.padding': '[top=24,left=24,bottom=24,right=24]',
    },
    children: [projectRootElkNode],
    edges: [],
  };

  const layouted: any = await elk.layout(graph as any);
  const flatNodes: LayoutNode[] = [];
  const computeAbsolute = (node: any, absX: number, absY: number) => {
    const x = absX + (node.x || 0);
    const y = absY + (node.y || 0);

    if (validNodes.has(node.id)) {
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
      node.children.forEach((c: any) => computeAbsolute(c, x, y));
    }
  };

  layouted.children?.forEach((c: any) => computeAbsolute(c, 0, 0));
  normalizeFlatNodes(flatNodes);

  const nodeLayoutIndex = new Map(flatNodes.map((node) => [node.id, node]));
  const flatEdges = filters.showEdges
    ? buildRenderedEdges(graphData, validNodes, nodeIndex, nodeLayoutIndex, true)
    : [];

  const canvasBounds = computeCanvasBounds(flatNodes);

  return {
    nodes: flatNodes,
    edges: flatEdges,
    width: Math.max(layouted.width || 0, canvasBounds.width),
    height: Math.max(layouted.height || 0, canvasBounds.height),
  };
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
    const sourceId = getLinkNodeId(link.source);
    const targetId = getLinkNodeId(link.target);
    const visibleSourceId = getOwningDependencyNodeId(sourceId, nodeIndex);
    const visibleTargetId = getOwningDependencyNodeId(targetId, nodeIndex);

    if (
      !visibleSourceId ||
      !visibleTargetId ||
      visibleSourceId === visibleTargetId ||
      !visibleNodeIds.has(visibleSourceId) ||
      !visibleNodeIds.has(visibleTargetId)
    ) {
      return;
    }

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

const runDependencyLayout = async (
  graphData: GraphData,
  filters: GraphFilters,
  selectedNodeId?: string
): Promise<LayoutResult> => {
  const nodeIndex = new Map(graphData.nodes.map((node) => [node.id, node]));
  const validNodes = new Map<string, GraphNode>();
  graphData.nodes.forEach((node) => {
    if ((node.type === 'file' && filters.showFiles) || (node.type === 'adr' && filters.showADR)) {
      validNodes.set(node.id, node);
    }
  });

  const { dependencyEdges, focusedNodeIds, collapsedSelectedId } = buildDependencyLayoutEdges(
    graphData,
    validNodes,
    nodeIndex,
    selectedNodeId
  );

  const hasFocusedSelection = Boolean(collapsedSelectedId && focusedNodeIds.size > 1);

  const dependencyNodes = Array.from(validNodes.values())
    .filter((node) => {
      if (!hasFocusedSelection) {
        return true;
      }

      return focusedNodeIds.has(node.id);
    })
    .sort(sortNodesForLayout)
    .map((node) => createElkNode(node, 'dependencies'));

  const graph = {
    id: 'dependency-root',
    layoutOptions: {
      'elk.algorithm': dependencyEdges.length > 0 ? 'layered' : 'box',
      'elk.direction': 'RIGHT',
      'elk.edgeRouting': 'POLYLINE',
      'elk.layered.nodePlacement.strategy': 'NETWORK_SIMPLEX',
      'elk.layered.crossingMinimization.strategy': 'LAYER_SWEEP',
      'elk.layered.spacing.nodeNodeBetweenLayers': hasFocusedSelection ? '140' : '110',
      'elk.layered.spacing.edgeNodeBetweenLayers': '70',
      'elk.spacing.nodeNode': hasFocusedSelection ? '80' : '56',
      'elk.spacing.componentComponent': '120',
      'elk.padding': '[top=40,left=40,bottom=40,right=40]',
    },
    children: dependencyNodes,
    edges: dependencyEdges
      .filter((edge) => {
        if (!hasFocusedSelection) {
          return true;
        }

        return focusedNodeIds.has(edge.sources[0]) && focusedNodeIds.has(edge.targets[0]);
      })
      .map((edge) => ({
        id: edge.id,
        sources: edge.sources,
        targets: edge.targets,
      })),
  };

  const layouted: any = await elk.layout(graph as any);
  const flatNodes: LayoutNode[] = (layouted.children || []).map((node: any) => ({
    id: node.id,
    x: node.x || 0,
    y: node.y || 0,
    width: node.width || 0,
    height: node.height || 0,
    data: validNodes.get(node.id)!,
    isContainer: false,
  }));
  normalizeFlatNodes(flatNodes);

  const nodeLayoutIndex = new Map(flatNodes.map((node) => [node.id, node]));
  const edgeDataById = new Map(dependencyEdges.map((edge) => [edge.id, edge.data]));
  const flatEdges: LayoutEdge[] = filters.showEdges
    ? (layouted.edges || []).flatMap((edge: any) => {
        const sourceId = edge.sources?.[0];
        const targetId = edge.targets?.[0];
        const sourceNode = nodeLayoutIndex.get(sourceId);
        const targetNode = nodeLayoutIndex.get(targetId);
        if (!sourceNode || !targetNode) {
          return [];
        }

        return [
          {
            id: edge.id,
            sections: buildOrthogonalSections(sourceNode, targetNode),
            data: edgeDataById.get(edge.id),
            sourceId,
            targetId,
          },
        ];
      })
    : [];

  const canvasBounds = computeCanvasBounds(flatNodes);

  return {
    nodes: flatNodes,
    edges: flatEdges,
    width: Math.max(layouted.width || 0, canvasBounds.width),
    height: Math.max(layouted.height || 0, canvasBounds.height),
  };
};

export const runLayout = async (
  graphData: GraphData,
  filters: GraphFilters,
  layoutMode: LayoutMode,
  selectedNodeId?: string
): Promise<LayoutResult> => {
  if (layoutMode === 'dependencies') {
    return runDependencyLayout(graphData, filters, selectedNodeId);
  }

  return runHierarchyLayout(graphData, filters);
};
