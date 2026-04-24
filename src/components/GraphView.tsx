import React, { useEffect, useState } from 'react';
import { TransformWrapper, TransformComponent } from 'react-zoom-pan-pinch';
import { useStore } from '../store/useStore';
import { FilterPanel } from './FilterPanel';
import { runLayout, LayoutNode } from '../utils/layoutEngine';

export const GraphView: React.FC = () => {
  const { graphData, error, filters, layoutData, setLayoutData, setSelectedNode, selectedNode } = useStore();
  const [isCalculating, setIsCalculating] = useState(false);

  useEffect(() => {
    if (!graphData) return;
    let isMounted = true;

    setIsCalculating(true);
    runLayout(graphData, filters).then(res => {
      if (isMounted) {
        setLayoutData(res);
        setIsCalculating(false);
      }
    }).catch(err => {
      console.error('Layout error', err);
      if (isMounted) setIsCalculating(false);
    });

    return () => {
      isMounted = false;
    };
  }, [graphData, filters]);

  if (error) {
    return (
      <div style={{ width: '100%', height: '100%', background: 'var(--bg0)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--red)' }}>
        Error: {error}
      </div>
    );
  }

  if (!graphData) {
    return (
      <div style={{ width: '100%', height: '100%', background: 'var(--bg0)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--t1)' }}>
        Откройте проект для анализа.
      </div>
    );
  }

  return (
    <div style={{ width: '100%', height: '100%', background: 'var(--bg0)', position: 'relative', display: 'flex', overflow: 'hidden' }}>
      {isCalculating && (
        <div style={{ position: 'absolute', top: 10, left: 10, color: 'var(--acc)', zIndex: 10, background: 'var(--bg1)', padding: '6px 12px', borderRadius: 6, border: '1px solid var(--border)' }}>
          Перерасчет графа...
        </div>
      )}
      
      <div style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }}>
        <TransformWrapper
          initialScale={1}
          minScale={0.05}
          maxScale={5}
          centerOnInit={true}
          limitToBounds={false}
          wheel={{ step: 0.0001 }}
        >
          <TransformComponent wrapperStyle={{ width: '100%', height: '100%' }}>
            {layoutData && (
              <div style={{ 
                position: 'relative', 
                width: layoutData.width, 
                height: layoutData.height 
              }}>
                {/* Слой связей (Edges) */}
                <svg style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', pointerEvents: 'none', zIndex: 1 }}>
                  <defs>
                    <marker id="arrowhead" markerWidth="10" markerHeight="7" refX="9" refY="3.5" orient="auto">
                      <polygon points="0 0, 10 3.5, 0 7" fill="var(--t3)" />
                    </marker>
                    <marker id="arrowhead-adr" markerWidth="10" markerHeight="7" refX="9" refY="3.5" orient="auto">
                      <polygon points="0 0, 10 3.5, 0 7" fill="var(--purple)" />
                    </marker>
                  </defs>
                  {layoutData.edges.map(edge => {
                    const isAdr = edge.data.type === 'adr';
                    const strokeColor = isAdr ? 'var(--purple)' : 'var(--t3)';
                    const strokeWidth = isAdr ? 3 : 1.5;
                    const strokeDasharray = isAdr ? '5,5' : 'none';
                    const marker = isAdr ? 'url(#arrowhead-adr)' : 'url(#arrowhead)';

                    const d = edge.sections.map((sec: any) => {
                      let pathData = `M ${sec.startPoint.x} ${sec.startPoint.y} `;
                      if (sec.bendPoints) {
                        pathData += sec.bendPoints.map((b: any) => `L ${b.x} ${b.y} `).join('');
                      }
                      pathData += `L ${sec.endPoint.x} ${sec.endPoint.y}`;
                      return pathData;
                    }).join(' ');

                    return (
                      <path 
                        key={edge.id}
                        d={d}
                        fill="none"
                        stroke={strokeColor}
                        strokeWidth={strokeWidth}
                        strokeDasharray={strokeDasharray}
                        markerEnd={marker}
                        opacity={0.6}
                      />
                    );
                  })}
                </svg>

                {/* Слой узлов (Nodes) */}
                {layoutData.nodes.map(node => (
                  <NodeComponent 
                    key={node.id} 
                    node={node} 
                    isSelected={selectedNode?.id === node.id}
                    onClick={() => setSelectedNode(node.data)}
                  />
                ))}
              </div>
            )}
          </TransformComponent>
        </TransformWrapper>
      </div>
      <FilterPanel />
    </div>
  );
};

const NodeComponent: React.FC<{ node: LayoutNode; isSelected: boolean; onClick: () => void }> = ({ node, isSelected, onClick }) => {
  const { type, label, churn } = node.data;
  
  let bgColor = 'var(--bg2)';
  let border = isSelected ? '2px solid var(--acc)' : '1px solid var(--border)';
  let borderRadius = '6px';
  let isContainer = false;
  let textColor = 'var(--t0)';
  let boxShadow = '0 2px 8px rgba(0,0,0,0.4)';
  let labelBackground = 'transparent';

  if (type === 'project') {
    bgColor = 'rgba(167, 139, 250, 0.08)';
    border = isSelected ? '2px solid var(--purple)' : '2px solid rgba(167, 139, 250, 0.45)';
    isContainer = true;
    textColor = 'var(--purple)';
    boxShadow = 'inset 0 0 0 1px rgba(167, 139, 250, 0.15)';
    labelBackground = 'rgba(167, 139, 250, 0.16)';
  } else if (type === 'directory') {
    bgColor = 'rgba(77, 159, 255, 0.08)';
    border = isSelected ? '2px solid var(--blue)' : '2px solid rgba(77, 159, 255, 0.45)';
    isContainer = true;
    textColor = 'var(--blue)';
    boxShadow = 'inset 0 0 0 1px rgba(77, 159, 255, 0.12)';
    labelBackground = 'rgba(77, 159, 255, 0.14)';
  } else if (type === 'file') {
    bgColor = 'rgba(34, 197, 94, 0.07)';
    border = isSelected ? '2px solid var(--green)' : '1px solid rgba(34, 197, 94, 0.35)';
    isContainer = true;
    textColor = 'var(--green)';
    boxShadow = 'inset 0 0 0 1px rgba(34, 197, 94, 0.08)';
    labelBackground = 'rgba(34, 197, 94, 0.12)';
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
  if (churn && churn > 5 && !isContainer) {
    border = '2px dashed var(--red)';
  }

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
        boxShadow: isContainer ? boxShadow : '0 2px 8px rgba(0,0,0,0.4)',
        overflow: 'hidden',
        cursor: 'pointer',
        zIndex: isContainer ? 0 : 2,
        transition: 'border 0.2s ease, box-shadow 0.2s ease, transform 0.1s'
      }}
      title={label}
      onMouseEnter={(e) => {
        if (!isContainer) e.currentTarget.style.transform = 'scale(1.05)';
      }}
      onMouseLeave={(e) => {
        if (!isContainer) e.currentTarget.style.transform = 'scale(1)';
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
