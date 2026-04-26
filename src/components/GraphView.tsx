import React from 'react';
import { useTranslation } from 'react-i18next';
import { TransformWrapper, TransformComponent } from 'react-zoom-pan-pinch';
import { ElkPoint } from 'elkjs/lib/elk.bundled';
import { useStore } from '../store/useStore';
import { FilterPanel } from './FilterPanel';
import { useGraphLayout } from '../hooks/useGraphLayout';
import { GraphNodeComponent } from './GraphNodeComponent';

export const GraphView: React.FC = () => {
  const { t } = useTranslation();
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

  const { isCalculating, graphInsights } = useGraphLayout(
    graphData,
    filters,
    layoutMode,
    selectedNode,
    setLayoutData,
    layoutData
  );

  if (error) {
    return (
      <div style={{ width: '100%', height: '100%', background: 'var(--bg0)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--red)' }}>
        {t('graphView.error')}: {error}
      </div>
    );
  }

  if (!graphData) {
    return (
      <div style={{ width: '100%', height: '100%', background: 'var(--bg0)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--t1)' }}>
        {t('graphView.openProjectToAnalyze')}
      </div>
    );
  }

  return (
    <div style={{ width: '100%', height: '100%', background: 'var(--bg0)', position: 'relative', display: 'flex', overflow: 'hidden' }}>
      {isCalculating && (
        <div style={{ position: 'absolute', top: 10, left: 10, color: 'var(--acc)', zIndex: 10, background: 'var(--bg1)', padding: '6px 12px', borderRadius: 6, border: '1px solid var(--border)' }}>
          {t('graphView.recalculatingGraph')}
        </div>
      )}
      <div style={{ position: 'absolute', top: 10, left: 10, color: 'var(--t1)', zIndex: 10, background: 'var(--bg1)', padding: '8px 12px', borderRadius: 8, border: '1px solid var(--border)', fontSize: 12, width: 'min(420px, calc(100% - 260px))' }}>
        <div style={{ fontWeight: 700, marginBottom: 4 }}>
          {t('graphView.mode')}: {layoutMode === 'hierarchy' ? t('graphView.hierarchy') : t('graphView.dependencies')}
        </div>
        <div style={{ color: 'var(--t2)', lineHeight: 1.4 }}>
          {layoutMode === 'hierarchy'
            ? (graphInsights?.selectedVisibleId
              ? t('graphView.hierarchySelectedDescription', { incomingCount: graphInsights.incomingCount, outgoingCount: graphInsights.outgoingCount })
              : t('graphView.hierarchyDefaultDescription'))
            : (graphInsights?.selectedVisibleId
              ? t('graphView.dependenciesSelectedDescription', { incomingCount: graphInsights.incomingCount, outgoingCount: graphInsights.outgoingCount })
              : t('graphView.dependenciesDefaultDescription'))
          }
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
                {/* Edge layer */}
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

                    const d = edge.sections.map((sec) => {
                      let pathData = `M ${sec.startPoint.x} ${sec.startPoint.y} `;
                      if (sec.bendPoints) {
                        pathData += sec.bendPoints.map((b: ElkPoint) => `L ${b.x} ${b.y} `).join('');
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

                {/* Node layer */}
                {layoutData.nodes.map(node => (
                  <GraphNodeComponent 
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
