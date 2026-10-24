/**
 * Lets a tool panel select a file in the graph from its path. The panels list files that come
 * from the main process as plain paths; this finds the graph node behind a path, tells whether
 * there is one, and selects it.
 */
import { useCallback } from 'react';
import { findNodeForFile } from '../components/panels/duplicatesUtils';
import { useGraphStore } from '../store/useStore';

/** What a panel needs to turn file paths into buttons that select the file in the graph. */
export interface FileSelectionHandlers {
  /** Whether the graph holds a node for this file. */
  isSelectable: (file: string) => boolean;
  /** Selects the node of this file; does nothing when the graph has none. */
  onSelect: (file: string) => void;
}

/** Selection handlers bound to the graph that is open. */
export function useFileSelection(): FileSelectionHandlers {
  const { graphData, setSelectedNode } = useGraphStore();
  const nodes = graphData?.nodes;

  const nodeFor = useCallback(
    (file: string) => (nodes ? findNodeForFile(nodes, file) : null),
    [nodes]
  );
  const isSelectable = useCallback((file: string) => nodeFor(file) !== null, [nodeFor]);
  const onSelect = useCallback(
    (file: string) => {
      const node = nodeFor(file);
      if (node) setSelectedNode(node);
    },
    [nodeFor, setSelectedNode]
  );
  return { isSelectable, onSelect };
}
