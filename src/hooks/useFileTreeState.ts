// Hook that supplies the file explorer with its tree, expanded folders and selection handling.
import { useMemo, useState } from 'react';
import { useGraphStore, useConnectionStore } from '../store/useStore';
import { buildFileTree, type FileTreeEntry } from '../components/fileTreeModel';

/** Explorer state: the tree built from the graph, expansion toggles and selection. */
export const useFileTreeState = () => {
  const { graphData, selectedPath, isLoading, error, setSelectedNode, setSelectedPath } =
    useGraphStore();
  const { openProject } = useConnectionStore();
  const [expandedFolders, setExpandedFolders] = useState<Record<string, boolean>>({});

  const toggleFolder = (path: string, currentlyExpanded: boolean) => {
    setExpandedFolders((prev) => ({ ...prev, [path]: !currentlyExpanded }));
  };

  const handleSelect = (node: FileTreeEntry) => {
    setSelectedPath(node.path);
    if (node.nodeData) {
      setSelectedNode(node.nodeData);
    } else {
      setSelectedNode(null);
    }
  };

  const tree = useMemo(() => (graphData ? buildFileTree(graphData) : null), [graphData]);

  return {
    selectedPath,
    isLoading,
    error,
    openProject,
    expandedFolders,
    toggleFolder,
    handleSelect,
    tree,
  };
};
