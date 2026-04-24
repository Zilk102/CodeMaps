import ELK from 'elkjs/lib/elk.bundled.js';
import { GraphData, GraphNode } from '../store/useStore';

const elk = new ELK();

export interface LayoutNode {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
  data: GraphNode;
  children?: LayoutNode[];
}

export interface LayoutEdge {
  id: string;
  sections: any[];
  data: any;
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

  const horizontalDominant = Math.abs(targetCenterX - sourceCenterX) >= Math.abs(targetCenterY - sourceCenterY);

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

export const runLayout = async (
  graphData: GraphData,
  filters: any
): Promise<LayoutResult> => {
  const nodeIndex = new Map(graphData.nodes.map((node) => [node.id, node]));

  // 1. Фильтруем валидные узлы
  const validNodes = new Map<string, GraphNode>();
  graphData.nodes.forEach(n => {
    let isHidden = false;
    if (n.type === 'directory' && !filters.showDirectories) isHidden = true;
    if (n.type === 'file' && !filters.showFiles) isHidden = true;
    if (n.type === 'function' && !filters.showFunctions) isHidden = true;
    if (n.type === 'class' && !filters.showClasses) isHidden = true;
    if (n.type === 'adr' && !filters.showADR) isHidden = true;
    if (!isHidden) validNodes.set(n.id, n);
  });

  const projectRootNode: GraphNode = {
    id: PROJECT_ROOT_ID,
    label: graphData.projectRoot.replace(/\\/g, '/').split('/').filter(Boolean).pop() || 'project',
    group: -1,
    type: 'project',
    churn: 0,
  };
  validNodes.set(PROJECT_ROOT_ID, projectRootNode);

  // 2. Строим иерархию ELK
  const elkNodesMap = new Map<string, any>();
  validNodes.forEach(n => {
    elkNodesMap.set(n.id, {
      id: n.id,
      labels: [{ text: n.label, width: n.label.length * 8, height: 16 }],
      layoutOptions: {
        'elk.padding': '[top=40,left=20,bottom=20,right=20]',
      }
    });
  });

  const rootChildren: any[] = [];
  validNodes.forEach(n => {
    if (n.id === PROJECT_ROOT_ID) return;
    const elkNode = elkNodesMap.get(n.id);
    let parentId = n.parentId;
    
    // Ищем ближайшего валидного родителя (если оригинальный родитель был отфильтрован)
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

  // Задаем размеры листовым узлам (иначе ELK сожмет их в 0x0)
  const assignDimensions = (node: any) => {
    if (!node.children || node.children.length === 0) {
      // Для функций/классов размер может быть меньше
      const isMethod = node.id.includes('#');
      node.width = isMethod ? 150 : 200;
      node.height = isMethod ? 40 : 50;
    } else {
      node.children.forEach(assignDimensions);
    }
  };
  rootChildren.forEach(assignDimensions);

  // 3. Для compound-иерархии используем box-layout ELK.
  // Реальные импортные/ADR связи участвуют только в рендере после layout.
  const elkEdges: any[] = [];

  const graph = {
    id: 'root',
    layoutOptions: {
      'elk.algorithm': 'box',
      'elk.spacing.nodeNode': '56',
      'elk.spacing.componentComponent': '72',
      'elk.padding': '[top=24,left=24,bottom=24,right=24]',
    },
    children: [projectRootElkNode],
    edges: elkEdges
  };

  // 4. Запускаем математический расчет ELK
  const layouted: any = await elk.layout(graph as any);

  // 5. Разворачиваем иерархию (Flattening) для абсолютного позиционирования в React
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
        data: validNodes.get(node.id)!
      });
    }

    if (node.children) {
      node.children.forEach((c: any) => computeAbsolute(c, x, y));
    }
  };

  layouted.children?.forEach((c: any) => computeAbsolute(c, 0, 0));

  if (flatNodes.length > 0) {
    const minX = Math.min(...flatNodes.map((node) => node.x));
    const minY = Math.min(...flatNodes.map((node) => node.y));

    if (minX !== 0 || minY !== 0) {
      flatNodes.forEach((node) => {
        node.x -= minX;
        node.y -= minY;
      });
    }
  }

  const nodeLayoutIndex = new Map(flatNodes.map((node) => [node.id, node]));
  const flatEdges: LayoutEdge[] = [];

  if (filters.showEdges) {
    graphData.links.forEach((link, idx) => {
      const sourceId = typeof link.source === 'string' ? link.source : link.source.id;
      const targetId = typeof link.target === 'string' ? link.target : link.target.id;

      const visibleSourceId = resolveVisibleNodeId(sourceId, new Set(validNodes.keys()), nodeIndex);
      const visibleTargetId = resolveVisibleNodeId(targetId, new Set(validNodes.keys()), nodeIndex);

      if (!visibleSourceId || !visibleTargetId || visibleSourceId === visibleTargetId) {
        return;
      }

      const sourceNode = nodeLayoutIndex.get(visibleSourceId);
      const targetNode = nodeLayoutIndex.get(visibleTargetId);

      if (!sourceNode || !targetNode) {
        return;
      }

      flatEdges.push({
        id: `e${idx}`,
        sections: buildOrthogonalSections(sourceNode, targetNode),
        data: link,
      });
    });
  }

  return {
    nodes: flatNodes,
    edges: flatEdges,
    width: layouted.width || 0,
    height: layouted.height || 0
  };
};
