import React from 'react';
import type { LayoutNode } from '../utils/layoutEngine';

interface NodeComponentProps {
  node: LayoutNode;
  layoutMode: 'hierarchy' | 'dependencies';
  emphasis: 'selected' | 'related' | 'muted' | 'default';
  isSelected: boolean;
  onClick: () => void;
}

export const GraphNodeComponent: React.FC<NodeComponentProps> = ({ node, layoutMode, emphasis, isSelected, onClick }) => {
  const { type, label, churn } = node.data;
  
  let bgColor = 'var(--bg2)';
  let border = isSelected ? '2px solid var(--acc)' : '1px solid var(--border)';
  let borderRadius = '6px';
  const isContainer = node.isContainer;
  let textColor = 'var(--t0)';
  let boxShadow = '0 2px 8px rgba(0,0,0,0.4)';
  let labelBackground = 'transparent';

  if (type === 'project') {
    bgColor = 'rgba(167, 139, 250, 0.08)';
    border = isSelected ? '2px solid var(--purple)' : '2px solid rgba(167, 139, 250, 0.45)';
    textColor = 'var(--purple)';
    boxShadow = 'inset 0 0 0 1px rgba(167, 139, 250, 0.15)';
    labelBackground = 'rgba(167, 139, 250, 0.16)';
  } else if (type === 'directory') {
    if (isContainer) {
      bgColor = 'rgba(77, 159, 255, 0.08)';
      border = isSelected ? '2px solid var(--blue)' : '2px solid rgba(77, 159, 255, 0.45)';
      textColor = 'var(--blue)';
      boxShadow = 'inset 0 0 0 1px rgba(77, 159, 255, 0.12)';
      labelBackground = 'rgba(77, 159, 255, 0.14)';
    } else {
      bgColor = 'rgba(77, 159, 255, 0.14)';
      border = isSelected ? '2px solid var(--blue)' : '1px solid rgba(77, 159, 255, 0.45)';
      textColor = 'var(--blue)';
    }
  } else if (type === 'file') {
    if (isContainer) {
      bgColor = 'rgba(34, 197, 94, 0.07)';
      border = isSelected ? '2px solid var(--green)' : '1px solid rgba(34, 197, 94, 0.35)';
      textColor = 'var(--green)';
      boxShadow = 'inset 0 0 0 1px rgba(34, 197, 94, 0.08)';
      labelBackground = 'rgba(34, 197, 94, 0.12)';
    } else {
      bgColor = 'rgba(34, 197, 94, 0.14)';
      border = isSelected ? '2px solid var(--green)' : '1px solid rgba(34, 197, 94, 0.45)';
      textColor = 'var(--green)';
    }
  } else if (type === 'class') {
    bgColor = 'var(--orange)';
    border = isSelected ? '2px solid #fff' : '1px solid var(--orange)';
    borderRadius = '12px';
    textColor = '#000';
  } else if (type === 'function') {
    bgColor = 'var(--cyan)';
    border = isSelected ? '2px solid #fff' : '1px solid var(--cyan)';
    borderRadius = '10px';
    textColor = '#000';
  } else if (type === 'adr') {
    bgColor = 'var(--purple)';
    border = isSelected ? '2px solid #fff' : '2px dashed var(--purple)';
    borderRadius = '8px';
    textColor = '#fff';
  }

  // Churn override
  if (churn && churn > 5 && (!isContainer || layoutMode === 'dependencies')) {
    border = '2px dashed var(--red)';
  }

  const opacity = emphasis === 'muted' ? 0.24 : 1;
  const nodeTransform = emphasis === 'selected'
    ? 'scale(1.03)'
    : emphasis === 'related'
      ? 'scale(1.01)'
      : 'scale(1)';
  const computedBoxShadow = emphasis === 'selected'
    ? `0 0 0 1px var(--acc), 0 10px 28px rgba(0,0,0,0.55)`
    : emphasis === 'related'
      ? `0 0 0 1px rgba(255,255,255,0.14), ${boxShadow}`
      : (isContainer ? boxShadow : '0 2px 8px rgba(0,0,0,0.4)');

  return (
    <div
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
      style={{
        position: 'absolute',
        left: node.x,
        top: node.y,
        width: node.width,
        height: node.height,
        backgroundColor: bgColor,
        border: border,
        borderRadius: borderRadius,
        boxSizing: 'border-box',
        display: 'flex',
        flexDirection: 'column',
        alignItems: isContainer ? 'flex-start' : 'center',
        justifyContent: isContainer ? 'flex-start' : 'center',
        padding: isContainer ? '8px' : '0 10px',
        color: textColor,
        fontSize: isContainer ? '11px' : '10px',
        fontWeight: isContainer ? '600' : 'normal',
        fontFamily: 'var(--font-family)',
        pointerEvents: 'auto',
        overflow: 'hidden',
        cursor: 'pointer',
        zIndex: isContainer ? 0 : 2,
        transition: 'border 0.2s ease, box-shadow 0.2s ease, transform 0.1s, opacity 0.2s ease',
        opacity,
        transform: nodeTransform,
        boxShadow: computedBoxShadow,
      }}
      title={label}
      onMouseEnter={(e) => {
        if (!isContainer) e.currentTarget.style.transform = emphasis === 'selected' ? 'scale(1.06)' : 'scale(1.05)';
      }}
      onMouseLeave={(e) => {
        if (!isContainer) e.currentTarget.style.transform = nodeTransform;
      }}
    >
      <div style={{
        whiteSpace: 'nowrap',
        overflow: 'hidden',
        textOverflow: 'ellipsis',
        maxWidth: '100%',
        background: isContainer ? labelBackground : 'transparent',
        padding: isContainer ? '2px 8px' : 0,
        borderRadius: isContainer ? '999px' : 0
      }}>
        {label}
      </div>
    </div>
  );
};
