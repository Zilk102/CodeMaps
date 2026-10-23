import React, { useMemo } from 'react';
import type { LayoutResult } from '../../utils/layoutEngine';
import type { GraphNode, LayoutMode } from '../../types/graph';
import { GraphNodeComponent } from '../GraphNodeComponent';
import { buildEdgePath, getEdgeAppearance, getEdgeOpacity, getNodeEmphasis } from './edgeStyle';

export interface GraphInsights {
  selectedVisibleId: string | null;
  relatedNodeIds: Set<string>;
  incomingCount: number;
  outgoingCount: number;
}

const ArrowMarker: React.FC<{ id: string; fill: string }> = ({ id, fill }) => (
  <marker id={id} markerWidth="10" markerHeight="7" refX="9" refY="3.5" orient="auto">
    <polygon points="0 0, 10 3.5, 0 7" fill={fill} />
  </marker>
);

interface EdgeLayerProps {
  layoutData: LayoutResult;
  layoutMode: LayoutMode;
  graphInsights: GraphInsights | null;
}

/** SVG layer drawing every edge; in hierarchy mode a selection hides unrelated edges. */
export const GraphEdgeLayer: React.FC<EdgeLayerProps> = ({
  layoutData,
  layoutMode,
  graphInsights,
}) => {
  const edgeElements = useMemo(() => {
    if (!layoutData?.edges) return null;
    const selectedId = graphInsights?.selectedVisibleId;
    return layoutData.edges.map((edge) => {
      const isConnectedToSelection = selectedId
        ? edge.sourceId === selectedId || edge.targetId === selectedId
        : false;
      if (layoutMode === 'hierarchy' && selectedId && !isConnectedToSelection) {
        return null;
      }

      const { strokeColor, strokeWidth, strokeDasharray, marker } = getEdgeAppearance(
        edge.data.type,
        isConnectedToSelection
      );

      return (
        <path
          key={edge.id}
          d={buildEdgePath(edge.sections)}
          fill="none"
          stroke={strokeColor}
          strokeWidth={strokeWidth}
          strokeDasharray={strokeDasharray}
          markerEnd={marker}
          opacity={getEdgeOpacity(!!selectedId, isConnectedToSelection, layoutMode)}
        />
      );
    });
  }, [layoutData, layoutMode, graphInsights]);

  return (
    <svg className="absolute top-0 left-0 w-full h-full pointer-events-none z-1">
      <defs>
        <ArrowMarker id="arrowhead" fill="var(--t3)" />
        <ArrowMarker id="arrowhead-adr" fill="var(--purple)" />
      </defs>
      {edgeElements}
    </svg>
  );
};

interface NodeLayerProps {
  layoutData: LayoutResult;
  layoutMode: LayoutMode;
  graphInsights: GraphInsights | null;
  selectedNode: GraphNode | null;
  onSelectNode: (node: GraphNode) => void;
}

export const GraphNodeLayer: React.FC<NodeLayerProps> = ({
  layoutData,
  layoutMode,
  graphInsights,
  selectedNode,
  onSelectNode,
}) => {
  const nodeElements = useMemo(() => {
    if (!layoutData?.nodes) return null;
    return layoutData.nodes.map((node) => (
      <GraphNodeComponent
        key={node.id}
        node={node}
        layoutMode={layoutMode}
        emphasis={getNodeEmphasis(
          node.id,
          selectedNode?.id,
          graphInsights?.selectedVisibleId,
          graphInsights?.relatedNodeIds
        )}
        isSelected={selectedNode?.id === node.id}
        onClick={() => onSelectNode(node.data)}
      />
    ));
  }, [layoutData, layoutMode, graphInsights, selectedNode, onSelectNode]);

  return <>{nodeElements}</>;
};
