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

  const cleanParentMap = new Map<string, string>();
  graphData.nodes.forEach(node => {
    if (node.parentId) {
      let curr: string | undefined = node.parentId;
      let hasCycle = false;
      const visited = new Set<string>();
      while (curr) {
        if (curr === node.id || visited.has(curr)) {
          hasCycle = true;
          break;
        }
        visited.add(curr);
        // Find parent of curr
        const parentNode = graphData.nodes.find(n => n.id === curr);
        curr = parentNode?.parentId;
      }
      if (!hasCycle) {
        cleanParentMap.set(node.id, node.parentId);
      }
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