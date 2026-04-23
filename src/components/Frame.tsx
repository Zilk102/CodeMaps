import React from 'react';
import { GraphNode } from '../store/useStore';

interface FrameProps {
  node: GraphNode;
  children?: React.ReactNode;
}

export const Frame: React.FC<FrameProps> = ({ node, children }) => {
  let borderColor = '#4fc3f7';
  let bgColor = 'rgba(79, 195, 247, 0.05)';
  let borderStyle = 'solid';

  if (node.type === 'directory') {
    borderColor = '#ab47bc';
    bgColor = 'rgba(171, 71, 188, 0.05)';
  } else if (node.type === 'file') {
    borderColor = '#4fc3f7';
    bgColor = 'rgba(79, 195, 247, 0.05)';
    borderStyle = 'dashed';
  } else if (node.type === 'class') {
    borderColor = '#ffb74d';
    bgColor = 'rgba(255, 183, 77, 0.05)';
  } else if (node.type === 'function') {
    borderColor = '#81c784';
    bgColor = 'rgba(129, 199, 132, 0.05)';
  } else if (node.type === 'adr' || node.adr) {
    borderColor = '#e91e63';
    bgColor = 'rgba(233, 30, 99, 0.05)';
  }

  return (
    <div
      style={{
        border: `2px ${borderStyle} ${borderColor}`,
        backgroundColor: bgColor,
        borderRadius: '8px',
        padding: '12px',
        margin: '8px',
        display: 'flex',
        flexDirection: 'column',
        color: '#fff',
        fontFamily: 'monospace',
        flex: '1 1 auto',
      }}
    >
      <div style={{ fontSize: '13px', fontWeight: 'bold', marginBottom: '8px', color: borderColor, whiteSpace: 'nowrap' }}>
        {node.label} <span style={{ opacity: 0.5, fontSize: '10px' }}>({node.type})</span>
      </div>
      
      {children && (
        <div style={{ 
          display: 'flex', 
          flexWrap: 'wrap', 
          gap: '12px',
          alignItems: 'flex-start',
          alignContent: 'flex-start',
        }}>
          {children}
        </div>
      )}
    </div>
  );
};
