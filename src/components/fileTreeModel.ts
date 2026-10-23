import type { GraphNode } from '../types/graph';

export interface FileTreeEntry {
  name: string;
  path: string;
  isDir: boolean;
  children?: Record<string, FileTreeEntry>;
  nodeData?: GraphNode;
}

/** Directories first, then alphabetical. */
export const compareEntries = (a: FileTreeEntry, b: FileTreeEntry): number => {
  if (a.isDir && !b.isDir) return -1;
  if (!a.isDir && b.isDir) return 1;
  return a.name.localeCompare(b.name);
};

export const sortedChildren = (entry: FileTreeEntry): FileTreeEntry[] =>
  Object.values(entry.children || {}).sort(compareEntries);

/** Builds the explorer tree from the file nodes of the graph. */
export const buildFileTree = (graphData: {
  nodes: GraphNode[];
  projectRoot: string;
}): FileTreeEntry => {
  const root: FileTreeEntry = { name: 'root', path: '', isDir: true, children: {} };

  const files = graphData.nodes.filter((n) => n.type === 'file');
  files.forEach((file) => {
    let relPath = file.id.replace(graphData.projectRoot.replace(/\\/g, '/'), '');
    if (relPath.startsWith('/')) relPath = relPath.substring(1);

    const parts = relPath.split('/');
    let current = root;

    parts.forEach((part, idx) => {
      const isLast = idx === parts.length - 1;
      if (!current.children) current.children = {};

      if (!current.children[part]) {
        const path = parts.slice(0, idx + 1).join('/');
        current.children[part] = {
          name: part,
          path,
          isDir: !isLast,
          nodeData: isLast ? file : undefined,
        };
      }
      current = current.children[part];
    });
  });

  return root;
};
