import React, { useMemo } from 'react';
import { GraphNode } from '../store/useStore';

interface FrameProps {
  node: GraphNode;
  children?: React.ReactNode;
  childCount?: number;
}

export const Frame: React.FC<FrameProps> = ({ node, children, childCount = 0 }) => {
  let borderColor = '#4fc3f7';
  let bgColor = 'rgba(79, 195, 247, 0.05)';
  let borderStyle = 'solid';

  if (node.type === 'directory') {
    borderColor = '#ab47bc';
    bgColor = 'rgba(171, 71, 188, 0.05)';
  } else if (node.type === 'class') {
    borderColor = '#ffb74d';
    borderStyle = 'dashed';
    bgColor = 'rgba(255, 183, 77, 0.05)';
  } else if (node.type === 'function') {
    borderColor = '#81c784';
    borderStyle = 'dotted';
    bgColor = 'rgba(129, 199, 132, 0.05)';
  }

  // Расчет идеального количества колонок для Masonry
  const cols = childCount > 0 ? Math.ceil(Math.sqrt(childCount)) : 1;

  // Ручной Masonry Layout (нативный Flexbox без багов с процентами ширины)
  const columns = useMemo(() => {
    if (!children) return [];
    const childrenArray = React.Children.toArray(children);
    const colsArray: React.ReactNode[][] = Array.from({ length: cols }, () => []);
    
    // Распределяем элементы по колонкам (сверху вниз, слева направо)
    childrenArray.forEach((child, index) => {
      colsArray[index % cols].push(child);
    });
    
    return colsArray;
  }, [children, cols]);

  return (
    <div
      style={{
        border: `2px ${borderStyle} ${borderColor}`,
        backgroundColor: bgColor,
        borderRadius: '8px',
        padding: '16px',
        margin: '8px', 
        display: 'inline-flex', // Возвращаемся к inline-flex
        flexDirection: 'column',
        color: '#fff',
        fontFamily: 'monospace',
        boxSizing: 'border-box',
        verticalAlign: 'top',
        width: 'max-content' 
      }}
    >
      <div style={{ 
        fontSize: '14px', 
        fontWeight: 'bold', 
        marginBottom: '16px', 
        color: borderColor, 
        whiteSpace: 'nowrap',
      }}>
        {node.label} <span style={{ opacity: 0.5, fontSize: '11px' }}>({node.type})</span>
      </div>
      
      {children && (
        <div style={{ display: 'flex', gap: '16px', alignItems: 'flex-start' }}>
          {columns.map((col, i) => (
            <div key={i} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              {col}
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
