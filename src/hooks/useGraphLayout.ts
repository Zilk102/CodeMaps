import { useEffect, useMemo, useState } from 'react';
import { runLayout, LayoutNode, LayoutResult } from '../utils/layoutEngine';
import type { GraphData, GraphFilters, LayoutMode, GraphNode } from '../types/graph';

export const resolveVisibleNodeId = (
  selectedNode: GraphNode | null,
  layoutNodes: LayoutNode[],
  graphData: GraphData
) => {
  if (!selectedNode) {
    return null;
  }

  const visibleNodeIds = new Set(layoutNodes.map((node) => node.id));
  const nodeIndex = new Map(graphData.nodes.map((node) => [node.id, node]));
  let currentId: string | undefined = selectedNode.id;

  while (currentId && !visibleNodeIds.has(currentId)) {
    currentId = nodeIndex.get(currentId)?.parentId;
  }

  return currentId || null;
};

export const useGraphLayout = (
  graphData: GraphData | null,
  filters: GraphFilters,
  layoutMode: LayoutMode,
  selectedNode: GraphNode | null,
  setLayoutData: (data: LayoutResult | null) => void,
  layoutData: LayoutResult | null
) => {
  const [isCalculating, setIsCalculating] = useState(false);

  useEffect(() => {
    if (!graphData) return;
    let isMounted = true;

    const performLayout = async () => {
      setIsCalculating(true);
      try {
        const res = await runLayout(graphData, filters, layoutMode, selectedNode?.id);
        if (isMounted) {
          setLayoutData(res);
          setIsCalculating(false);
        }
      } catch (err) {
        console.error('Layout error', err);
        if (isMounted) setIsCalculating(false);
      }
    };
    
    performLayout();

    return () => {
      isMounted = false;
    };
  }, [graphData, filters, layoutMode, selectedNode?.id, setLayoutData]);

  const graphInsights = useMemo(() => {
    if (!graphData || !layoutData) {
      return null;
    }

    const selectedVisibleId = resolveVisibleNodeId(selectedNode, layoutData.nodes, graphData);
    const connectedEdges = selectedVisibleId
      ? layoutData.edges.filter(
          (edge) => edge.sourceId === selectedVisibleId || edge.targetId === selectedVisibleId
        )
      : [];
    const relatedNodeIds = new Set<string>(selectedVisibleId ? [selectedVisibleId] : []);
    
    connectedEdges.forEach((edge) => {
      relatedNodeIds.add(edge.sourceId);
      relatedNodeIds.add(edge.targetId);
    });

    const incomingCount = connectedEdges.filter((edge) => edge.targetId === selectedVisibleId).length;
    const outgoingCount = connectedEdges.filter((edge) => edge.sourceId === selectedVisibleId).length;

    return {
      selectedVisibleId,
      connectedEdges,
      relatedNodeIds,
      incomingCount,
      outgoingCount,
    };
  }, [graphData, layoutData, selectedNode]);

  return { isCalculating, graphInsights };
};