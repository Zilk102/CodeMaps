import { createStore } from 'zustand/vanilla';

export interface GraphNode {
  id: string;
  label: string;
  group: number;
  type: string;
  churn: number;
  adr?: string;
  parentId?: string; // Указатель на родительский элемент (Слой Иерархии)
  exports?: Array<{
    exportedName: string;
    localName?: string;
    isDefault?: boolean;
  }>;
}

export interface GraphLink {
  source: string;
  target: string;
  value: number;
  type?: string;
}

export interface GraphData {
  nodes: GraphNode[];
  links: GraphLink[];
  projectRoot: string;
}

export interface GraphDiff {
  nodesAdded: GraphNode[];
  nodesRemoved: string[];
  linksAdded: GraphLink[];
  linksRemoved: GraphLink[]; // Для упрощения на фронте можно просто передавать измененные линки
}

export interface OracleState {
  baseDir: string;
  nodes: Map<string, GraphNode>;
  links: GraphLink[];
  churnMap: Map<string, number>;
  nodeRevision: number;
  linkRevision: number;
  
  // Actions
  setBaseDir: (dir: string) => void;
  setChurnMap: (map: Map<string, number>) => void;
  
  // Atomic updates to avoid race conditions during parallel parsing
  upsertNode: (node: GraphNode) => void;
  removeNode: (id: string) => void;
  removeNodesPrefix: (prefix: string) => void;
  
  addLink: (link: GraphLink) => void;
  removeLinksBySource: (source: string) => void;
  removeLinksBySourceOrTarget: (id: string) => void;
  
  // Batch updates for restoring from cache
  restoreCache: (nodes: GraphNode[], links: GraphLink[]) => void;
  
  clear: () => void;
  getValidGraph: () => GraphData;

  // Diff tracking
  pendingDiff: GraphDiff;
  resetDiff: () => void;
  getAndResetDiff: () => GraphDiff;
}

export const oracleStore = createStore<OracleState>()((set, get) => ({
  baseDir: '',
  nodes: new Map(),
  links: [],
  churnMap: new Map(),
  nodeRevision: 0,
  linkRevision: 0,
  pendingDiff: { nodesAdded: [], nodesRemoved: [], linksAdded: [], linksRemoved: [] },

  setBaseDir: (dir) => set({ baseDir: dir }),
  
  setChurnMap: (map) => set({ churnMap: map }),

  upsertNode: (node) => set((state) => {
    const newNodes = new Map(state.nodes);
    newNodes.set(node.id, node);
    return { 
      nodes: newNodes,
      nodeRevision: state.nodeRevision + 1,
      pendingDiff: {
        ...state.pendingDiff,
        nodesAdded: [...state.pendingDiff.nodesAdded, node]
      }
    };
  }),

  removeNode: (id) => set((state) => {
    const newNodes = new Map(state.nodes);
    newNodes.delete(id);
    return { 
      nodes: newNodes,
      nodeRevision: state.nodeRevision + 1,
      pendingDiff: {
        ...state.pendingDiff,
        nodesRemoved: [...state.pendingDiff.nodesRemoved, id]
      }
    };
  }),

  removeNodesPrefix: (prefix) => set((state) => {
    const newNodes = new Map(state.nodes);
    const removed: string[] = [];
    for (const [id] of newNodes) {
      if (id.startsWith(prefix)) {
        newNodes.delete(id);
        removed.push(id);
      }
    }
    return { 
      nodes: newNodes,
      nodeRevision: state.nodeRevision + 1,
      pendingDiff: {
        ...state.pendingDiff,
        nodesRemoved: [...state.pendingDiff.nodesRemoved, ...removed]
      }
    };
  }),

  addLink: (link) => set((state) => ({
    links: [...state.links, link],
    linkRevision: state.linkRevision + 1,
    pendingDiff: {
      ...state.pendingDiff,
      linksAdded: [...state.pendingDiff.linksAdded, link]
    }
  })),

  removeLinksBySource: (source) => set((state) => {
    const toRemove = state.links.filter(l => l.source === source);
    return {
      links: state.links.filter(l => l.source !== source),
      linkRevision: state.linkRevision + 1,
      pendingDiff: {
        ...state.pendingDiff,
        linksRemoved: [...state.pendingDiff.linksRemoved, ...toRemove]
      }
    };
  }),

  removeLinksBySourceOrTarget: (id) => set((state) => {
    const toRemove = state.links.filter(l => l.source === id || l.target === id);
    return {
      links: state.links.filter(l => l.source !== id && l.target !== id),
      linkRevision: state.linkRevision + 1,
      pendingDiff: {
        ...state.pendingDiff,
        linksRemoved: [...state.pendingDiff.linksRemoved, ...toRemove]
      }
    };
  }),

  restoreCache: (nodes, links) => set((state) => {
    const baseDir = state.baseDir.replace(/\\/g, '/');
    const normalizedNodes = nodes.map((node) => {
      const normalizedId = node.id.replace(/\\/g, '/');
      const normalizedParentId = node.parentId?.replace(/\\/g, '/');

      if (node.type === 'directory') {
        if (normalizedParentId) {
          return { ...node, id: normalizedId, parentId: normalizedParentId };
        }

        const parentDir = normalizedId.substring(0, normalizedId.lastIndexOf('/'));
        const hasParent = parentDir.startsWith(baseDir) && parentDir !== baseDir;
        return {
          ...node,
          id: normalizedId,
          parentId: hasParent ? parentDir : undefined,
        };
      }

      if (node.type === 'file' || node.type === 'adr') {
        const parentDir = normalizedId.substring(0, normalizedId.lastIndexOf('/'));
        const hasParent = parentDir.startsWith(baseDir) && parentDir !== baseDir;
        return {
          ...node,
          id: normalizedId,
          parentId: hasParent ? parentDir : undefined,
        };
      }

      if (normalizedId.includes('#')) {
        const fileId = normalizedId.split('#')[0];
        return {
          ...node,
          id: normalizedId,
          parentId: fileId,
        };
      }

      return {
        ...node,
        id: normalizedId,
        parentId: normalizedParentId,
      };
    });

    const newNodes = new Map();
    normalizedNodes.forEach((n) => newNodes.set(n.id, n));
    return { nodes: newNodes, links, nodeRevision: state.nodeRevision + 1, linkRevision: state.linkRevision + 1 };
  }),

  clear: () => set({
    baseDir: '',
    nodes: new Map(),
    links: [],
    churnMap: new Map(),
    nodeRevision: 0,
    linkRevision: 0
  }),

  getValidGraph: () => {
    const state = get();
    const possibleExts = [
      '.ts', '.tsx', '.js', '.jsx', '.mts', '.cts', '.mjs', '.cjs',
      '/index.ts', '/index.tsx', '/index.js', '/index.jsx', '/index.mts', '/index.cts', '/index.mjs', '/index.cjs'
    ];
    
    const validLinks: GraphLink[] = [];
    const resolveSymbolTarget = (filePath: string, symbolName: string) => {
      const fileNode = state.nodes.get(filePath);

      if (state.nodes.has(`${filePath}#${symbolName}`)) {
        return `${filePath}#${symbolName}`;
      }

      if (!fileNode?.exports?.length) {
        return undefined;
      }

      const directExport = fileNode.exports.find((record) =>
        record.exportedName === symbolName ||
        (symbolName === 'default' && record.isDefault)
      );

      if (directExport?.localName && state.nodes.has(`${filePath}#${directExport.localName}`)) {
        return `${filePath}#${directExport.localName}`;
      }

      if (directExport && state.nodes.has(`${filePath}#${directExport.exportedName}`)) {
        return `${filePath}#${directExport.exportedName}`;
      }

      return undefined;
    };
    
    state.links.forEach(l => {
      let resolvedTarget = l.target;
      let isValid = false;

      if (resolvedTarget.includes('#')) {
        if (state.nodes.has(resolvedTarget)) {
          isValid = true;
        } else {
          const [filePath, entityName] = resolvedTarget.split('#');
          const directResolvedSymbol = resolveSymbolTarget(filePath, entityName);
          if (directResolvedSymbol) {
            resolvedTarget = directResolvedSymbol;
            isValid = true;
          }

          if (isValid) {
            validLinks.push({ ...l, target: resolvedTarget });
            return;
          }

          for (const ext of possibleExts) {
            const resolvedSymbol = resolveSymbolTarget(`${filePath}${ext}`, entityName);
            if (resolvedSymbol) {
              resolvedTarget = resolvedSymbol;
              isValid = true;
              break;
            }
          }
          
          if (!isValid) {
            if (state.nodes.has(filePath)) {
              resolvedTarget = filePath;
              isValid = true;
            } else {
              for (const ext of possibleExts) {
                const fullFile = `${filePath}${ext}`;
                if (state.nodes.has(fullFile)) {
                  resolvedTarget = fullFile;
                  isValid = true;
                  break;
                }
              }
            }
          }
        }
      } else {
        if (state.nodes.has(resolvedTarget)) {
          isValid = true;
        } else {
          const targetNode = state.nodes.get(resolvedTarget);
          if (targetNode && targetNode.type === 'directory') {
            isValid = true;
          } else {
            for (const ext of possibleExts) {
              const p = resolvedTarget + ext;
              if (state.nodes.has(p)) {
                resolvedTarget = p; 
                isValid = true;
                break;
              }
            }
          }
        }
      }

      if (isValid) {
        validLinks.push({ ...l, target: resolvedTarget });
      }
    });

    return {
      projectRoot: state.baseDir,
      nodes: Array.from(state.nodes.values()),
      links: validLinks
    };
  },
  resetDiff: () => set({ pendingDiff: { nodesAdded: [], nodesRemoved: [], linksAdded: [], linksRemoved: [] } }),
  getAndResetDiff: () => {
    const diff = get().pendingDiff;
    set({ pendingDiff: { nodesAdded: [], nodesRemoved: [], linksAdded: [], linksRemoved: [] } });
    return diff;
  }
}));
