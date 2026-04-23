import { GraphNode } from '../store/useStore';

export interface TreeNode {
  data: GraphNode;
  children: TreeNode[];
}

export const buildTree = (
  graphData: { nodes: GraphNode[]; links: any[] } | null,
  filters: { showDirectories: boolean; showFiles: boolean; showFunctions: boolean; showClasses: boolean; showADR: boolean }
): TreeNode[] => {
  if (!graphData) return [];

  const parentMap = new Map<string, string>();
  const nodeIds = new Set(graphData.nodes.map(n => n.id));

  // 1. Извлекаем связи вложенности
  graphData.links.forEach(link => {
    if (link.type === 'structure' || link.type === 'entity') {
      const source = typeof link.source === 'string' ? link.source : (link.source as any).id;
      const target = typeof link.target === 'string' ? link.target : (link.target as any).id;
      if (nodeIds.has(source) && nodeIds.has(target) && source !== target) {
        if (link.type === 'structure') {
          parentMap.set(source, target);
        } else if (link.type === 'entity') {
          parentMap.set(target, source);
        }
      }
    }
  });

  // 2. Чистим от циклических зависимостей
  const cleanParentMap = new Map<string, string>();
  parentMap.forEach((parent, child) => {
    let curr: string | undefined = parent;
    let hasCycle = false;
    const visited = new Set<string>();
    while (curr) {
      if (curr === child || visited.has(curr)) {
        hasCycle = true;
        break;
      }
      visited.add(curr);
      curr = parentMap.get(curr);
    }
    if (!hasCycle) {
      cleanParentMap.set(child, parent);
    }
  });

  // 3. Строим дерево из плоского списка
  const nodeMap = new Map<string, TreeNode>();
  graphData.nodes.forEach(node => {
    // Применяем фильтры видимости прямо на этапе сборки дерева
    let isHidden = false;
    if (node.type === 'directory' && !filters.showDirectories) isHidden = true;
    if (node.type === 'file' && !filters.showFiles) isHidden = true;
    if (node.type === 'function' && !filters.showFunctions) isHidden = true;
    if (node.type === 'class' && !filters.showClasses) isHidden = true;
    if (node.type === 'adr' && !filters.showADR) isHidden = true;

    if (!isHidden) {
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