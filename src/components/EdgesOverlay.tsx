import React, { useState, useEffect } from 'react';
import { useStore, GraphLink } from '../store/useStore';

interface EdgePath {
  id: string;
  d: string;
  color: string;
}

export const EdgesOverlay: React.FC = () => {
  const { graphData, filters } = useStore();
  const [paths, setPaths] = useState<EdgePath[]>([]);

  useEffect(() => {
    if (!filters.showEdges || !graphData) {
      setPaths([]);
      return;
    }

    const computePaths = () => {
      const newPaths: EdgePath[] = [];
      const canvasContainer = document.getElementById('canvas-container');
      if (!canvasContainer) return;

      const containerRect = canvasContainer.getBoundingClientRect();
      const scale = parseFloat(canvasContainer.style.transform.match(/scale\(([^)]+)\)/)?.[1] || '1');
      // But wait! If we put SVG *inside* canvasContainer, we don't need scale!
      // We just need offsetLeft and offsetTop relative to canvasContainer.

      graphData.links.forEach((link, i) => {
        if (link.type === 'structure' || link.type === 'entity') return;

        const sourceId = typeof link.source === 'string' ? link.source : (link.source as any).id;
        const targetId = typeof link.target === 'string' ? link.target : (link.target as any).id;

        const sourceEl = document.getElementById(`node-${sourceId}`);
        const targetEl = document.getElementById(`node-${targetId}`);

        if (sourceEl && targetEl) {
          // Calculate full bounding box relative to canvas
          const getRect = (el: HTMLElement) => {
            let top = 0, left = 0;
            let curr: HTMLElement | null = el;
            while (curr && curr !== canvasContainer && curr !== document.body) {
              top += curr.offsetTop;
              left += curr.offsetLeft;
              curr = curr.offsetParent as HTMLElement;
            }
            return {
              x: left,
              y: top,
              w: el.offsetWidth,
              h: el.offsetHeight,
              cx: left + el.offsetWidth / 2,
              cy: top + el.offsetHeight / 2
            };
          };

          const r1 = getRect(sourceEl);
          const r2 = getRect(targetEl);

          const dx = r2.cx - r1.cx;
          const dy = r2.cy - r1.cy;

          let p1 = { x: 0, y: 0 };
          let p2 = { x: 0, y: 0 };
          let c1 = { x: 0, y: 0 };
          let c2 = { x: 0, y: 0 };

          // Determine the dominant direction
          const isHorizontal = Math.abs(dx) > Math.abs(dy);
          const offset = Math.max(Math.abs(dx), Math.abs(dy)) / 2;

          if (isHorizontal) {
            if (dx > 0) { // Right to Left
              p1 = { x: r1.x + r1.w, y: r1.cy };
              p2 = { x: r2.x, y: r2.cy };
              c1 = { x: p1.x + offset, y: p1.y };
              c2 = { x: p2.x - offset, y: p2.y };
            } else { // Left to Right
              p1 = { x: r1.x, y: r1.cy };
              p2 = { x: r2.x + r2.w, y: r2.cy };
              c1 = { x: p1.x - offset, y: p1.y };
              c2 = { x: p2.x + offset, y: p2.y };
            }
          } else {
            if (dy > 0) { // Bottom to Top
              p1 = { x: r1.cx, y: r1.y + r1.h };
              p2 = { x: r2.cx, y: r2.y };
              c1 = { x: p1.x, y: p1.y + offset };
              c2 = { x: p2.x, y: p2.y - offset };
            } else { // Top to Bottom
              p1 = { x: r1.cx, y: r1.y };
              p2 = { x: r2.cx, y: r2.y + r2.h };
              c1 = { x: p1.x, y: p1.y - offset };
              c2 = { x: p2.x, y: p2.y + offset };
            }
          }

          const d = `M ${p1.x} ${p1.y} C ${c1.x} ${c1.y}, ${c2.x} ${c2.y}, ${p2.x} ${p2.y}`;
          
          let color = 'rgba(255, 255, 255, 0.15)';
          if (link.type === 'import') color = 'rgba(255, 183, 77, 0.4)';
          if (link.type === 'adr') color = 'rgba(171, 71, 188, 0.4)';

          newPaths.push({ id: `edge-${i}`, d, color });
        }
      });
      setPaths(newPaths);
    };

    // Give React time to render DOM nodes (especially flexbox layouts)
    const timeout = setTimeout(computePaths, 100);
    
    // We should also recalculate on window resize
    window.addEventListener('resize', computePaths);

    return () => {
      clearTimeout(timeout);
      window.removeEventListener('resize', computePaths);
    };
  }, [graphData, filters]);

  if (!filters.showEdges) return null;

  return (
    <svg 
      style={{ 
        position: 'absolute', 
        top: 0, 
        left: 0, 
        width: '100%', 
        height: '100%', 
        pointerEvents: 'none',
        zIndex: 10,
        overflow: 'visible'
      }}
    >
      <defs>
        <marker id="arrowhead" markerWidth="10" markerHeight="7" refX="9" refY="3.5" orient="auto">
          <polygon points="0 0, 10 3.5, 0 7" fill="rgba(255,255,255,0.3)" />
        </marker>
      </defs>
      {paths.map(path => (
        <path
          key={path.id}
          d={path.d}
          fill="none"
          stroke={path.color}
          strokeWidth={2}
          markerEnd="url(#arrowhead)"
        />
      ))}
    </svg>
  );
};