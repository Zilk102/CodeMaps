import React, { useEffect, useMemo, useState } from 'react';
import { TransformWrapper, TransformComponent } from 'react-zoom-pan-pinch';
import { useStore } from '../store/useStore';
import { FilterPanel } from './FilterPanel';
import { runLayout, LayoutNode } from '../utils/layoutEngine';
import type { GraphData, GraphNode } from '../types/graph';

const resolveVisibleNodeId = (
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

export const GraphView: React.FC = () => {
  const {
    graphData,
    error,
    filters,
    layoutMode,
    layoutData,
    setLayoutData,
    setSelectedNode,
    selectedNode,
  } = useStore();
  const [isCalculating, setIsCalculating] = useState(false);

  useEffect(() => {
    if (!graphData) return;
    let isMounted = true;

    setIsCalculating(true);
    runLayout(graphData, filters, layoutMode, selectedNode?.id).then(res => {
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
  }, [graphData, filters, layoutMode, selectedNode?.id]);

  const graphInsights = useMemo(() => {
    if (!graphData || !layoutData) {
      return null;
    }

    const selectedVisibleId = resolveVisibleNodeId(selectedNode, layoutData.nodes, graphData);
    const connectedEdges = selectedVisibleId
      ? layoutData.edges.filter((edge) => edge.sourceId === selectedVisibleId || edge.targetId === selectedVisibleId)
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
      <div style={{ position: 'absolute', top: 10, left: 10, color: 'var(--t1)', zIndex: 10, background: 'var(--bg1)', padding: '8px 12px', borderRadius: 8, border: '1px solid var(--border)', fontSize: 12, width: 'min(420px, calc(100% - 260px))' }}>
        <div style={{ fontWeight: 700, marginBottom: 4 }}>
          Режим: {layoutMode === 'hierarchy' ? 'Иерархия' : 'Зависимости'}
        </div>
        <div style={{ color: 'var(--t2)', lineHeight: 1.4 }}>
          {layoutMode === 'hierarchy'
            ? (graphInsights?.selectedVisibleId
              ? `Показываются связи относительно выбранного узла: входящие ${graphInsights.incomingCount}, исходящие ${graphInsights.outgoingCount}.`
              : 'Выбери файл, класс или функцию, чтобы увидеть понятные входящие и исходящие зависимости внутри иерархии.')
            : (graphInsights?.selectedVisibleId
              ? `Показывается сфокусированный dependency-subgraph вокруг выбранного узла: входящие ${graphInsights.incomingCount}, исходящие ${graphInsights.outgoingCount}.`
              : 'Показывается обзор на уровне файлов и ADR. Выбери узел на графе или в дереве, чтобы сфокусироваться на его соседях.')}
        </div>
      </div>
      
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
                    const isConnectedToSelection = graphInsights?.selectedVisibleId
                      ? edge.sourceId === graphInsights.selectedVisibleId || edge.targetId === graphInsights.selectedVisibleId
                      : false;
                    if (layoutMode === 'hierarchy' && graphInsights?.selectedVisibleId && !isConnectedToSelection) {
                      return null;
                    }

                    const isAdr = edge.data.type === 'adr';
                    const isImport = edge.data.type === 'import';
                    const strokeColor = isAdr ? 'var(--purple)' : isImport ? 'rgba(255,255,255,0.75)' : 'var(--t3)';
                    const strokeWidth = isConnectedToSelection ? (isAdr ? 3.5 : 2.4) : (isAdr ? 2.4 : 1.2);
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
                        opacity={graphInsights?.selectedVisibleId ? (isConnectedToSelection ? 0.95 : 0.08) : (layoutMode === 'dependencies' ? 0.5 : 0.18)}
                      />
                    );
                  })}
                </svg>

                {/* Слой узлов (Nodes) */}
                {layoutData.nodes.map(node => (
                  <NodeComponent 
                    key={node.id} 
                    node={node} 
                    layoutMode={layoutMode}
                    emphasis={
                      graphInsights?.selectedVisibleId
                        ? (selectedNode?.id === node.id || graphInsights.selectedVisibleId === node.id
                          ? 'selected'
                          : graphInsights.relatedNodeIds.has(node.id)
                            ? 'related'
                            : 'muted')
                        : 'default'
                    }
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

const NodeComponent: React.FC<{ node: LayoutNode; layoutMode: 'hierarchy' | 'dependencies'; emphasis: 'selected' | 'related' | 'muted' | 'default'; isSelected: boolean; onClick: () => void }> = ({ node, layoutMode, emphasis, isSelected, onClick }) => {
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
