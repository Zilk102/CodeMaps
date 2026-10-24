// One node box on the graph canvas: styled by kind, emphasis and churn, with a hover zoom and
// click to select.
import React from 'react';
import type { LayoutNode } from '../utils/layoutEngine';
import {
  buildNodeBoxStyle,
  buildNodeLabelStyle,
  getHoverScale,
  getNodePalette,
  getNodeScale,
  type LayoutMode,
  type NodeEmphasis,
} from './graph/nodeStyle';

interface NodeComponentProps {
  node: LayoutNode;
  layoutMode: LayoutMode;
  emphasis: NodeEmphasis;
  isSelected: boolean;
  onClick: () => void;
}

/**
 * Absolutely positioned box for a laid-out node showing its label. A click selects it without
 * reaching the canvas; non-container nodes grow slightly on hover.
 */
export const GraphNodeComponent: React.FC<NodeComponentProps> = ({
  node,
  layoutMode,
  emphasis,
  isSelected,
  onClick,
}) => {
  const { type, label, churn } = node.data;
  const isContainer = node.isContainer;
  const restingTransform = getNodeScale(emphasis);

  return (
    <div
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
      style={buildNodeBoxStyle({
        x: node.x,
        y: node.y,
        width: node.width,
        height: node.height,
        type,
        churn,
        isContainer,
        layoutMode,
        emphasis,
        isSelected,
      })}
      title={label}
      onMouseEnter={(e) => {
        if (!isContainer) e.currentTarget.style.transform = getHoverScale(emphasis);
      }}
      onMouseLeave={(e) => {
        if (!isContainer) e.currentTarget.style.transform = restingTransform;
      }}
    >
      <div
        style={buildNodeLabelStyle(
          isContainer,
          getNodePalette(type, isSelected, isContainer).labelBackground
        )}
      >
        {label}
      </div>
    </div>
  );
};
