import React, { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { TransformWrapper, TransformComponent } from 'react-zoom-pan-pinch';
import { ElkPoint } from 'elkjs/lib/elk.bundled';
import { useGraphStore, useUIStore } from '../store/useStore';
import { FilterPanel } from './FilterPanel';
import { useGraphLayout } from '../hooks/useGraphLayout';
import { GraphNodeComponent } from './GraphNodeComponent';

export const GraphView: React.FC = () => {
  const { t } = useTranslation();
  const { graphData, error, filters, layoutMode, setSelectedNode, selectedNode } = useGraphStore();

  const { layoutData, setLayoutData } = useUIStore();

  const { isCalculating, graphInsights } = useGraphLayout(
    graphData,
    filters,
    layoutMode,
    selectedNode,
    setLayoutData,
    layoutData
  );

  const graphInfoWidth = 'min(420px, calc(100% - 320px))';

  const edgeElements = useMemo(() => {
    if (!layoutData?.edges) return null;
    return layoutData.edges.map((edge) => {
      const isConnectedToSelection = graphInsights?.selectedVisibleId
        ? edge.sourceId === graphInsights.selectedVisibleId ||
          edge.targetId === graphInsights.selectedVisibleId
        : false;
      if (
        layoutMode === 'hierarchy' &&
        graphInsights?.selectedVisibleId &&
        !isConnectedToSelection
      ) {
        return null;
      }

      const isAdr = edge.data.type === 'adr';
      const isImport = edge.data.type === 'import';
      const isFramework = edge.data.type === 'framework';
      const isBuild = edge.data.type === 'build';
      const strokeColor = isAdr
        ? 'var(--purple)'
        : isFramework
          ? 'rgba(92, 207, 230, 0.85)'
          : isBuild
            ? 'rgba(255, 195, 113, 0.85)'
            : isImport
              ? 'rgba(255,255,255,0.75)'
              : 'var(--t3)';
      const strokeWidth = isConnectedToSelection
        ? isAdr
          ? 3.5
          : isFramework || isBuild
            ? 2.8
            : 2.4
        : isAdr
          ? 2.4
          : isFramework || isBuild
            ? 1.8
            : 1.2;
      const strokeDasharray = isAdr ? '5,5' : isBuild ? '7,4' : isFramework ? '3,4' : 'none';
      const marker = isAdr ? 'url(#arrowhead-adr)' : 'url(#arrowhead)';

      const d = edge.sections
        .map((sec) => {
          let pathData = `M ${sec.startPoint.x} ${sec.startPoint.y} `;
          if (sec.bendPoints) {
            pathData += sec.bendPoints.map((b: ElkPoint) => `L ${b.x} ${b.y} `).join('');
          }
          pathData += `L ${sec.endPoint.x} ${sec.endPoint.y}`;
          return pathData;
        })
        .join(' ');

      return (
        <path
          key={edge.id}
          d={d}
          fill="none"
          stroke={strokeColor}
          strokeWidth={strokeWidth}
          strokeDasharray={strokeDasharray}
          markerEnd={marker}
          opacity={
            graphInsights?.selectedVisibleId
              ? isConnectedToSelection
                ? 0.95
                : 0.08
              : layoutMode === 'dependencies'
                ? 0.5
                : 0.18
          }
        />
      );
    });
  }, [layoutData, layoutMode, graphInsights]);

  const nodeElements = useMemo(() => {
    if (!layoutData?.nodes) return null;
    return layoutData.nodes.map((node) => (
      <GraphNodeComponent
        key={node.id}
        node={node}
        layoutMode={layoutMode}
        emphasis={
          graphInsights?.selectedVisibleId
            ? selectedNode?.id === node.id || graphInsights.selectedVisibleId === node.id
              ? 'selected'
              : graphInsights.relatedNodeIds.has(node.id)
                ? 'related'
                : 'muted'
            : 'default'
        }
        isSelected={selectedNode?.id === node.id}
        onClick={() => setSelectedNode(node.data)}
      />
    ));
  }, [layoutData, layoutMode, graphInsights, selectedNode, setSelectedNode]);

  if (error) {
    return (
      <div className="w-full h-full bg-(--bg0) flex items-center justify-center text-(--red)">
        {t('graphView.error')}: {error}
      </div>
    );
  }

  if (!graphData) {
    return (
      <div className="w-full h-full bg-(--bg0) flex items-center justify-center text-(--t1)">
        {t('graphView.openProjectToAnalyze')}
      </div>
    );
  }

  return (
    <div className="w-full h-full bg-(--bg0) relative flex overflow-hidden">
      {isCalculating && (
        <div className="absolute top-2.5 left-2.5 text-(--acc) z-10 bg-(--bg1) px-3 py-1.5 rounded-md border border-(--border)">
          {t('graphView.recalculatingGraph')}
        </div>
      )}
      <div
        className="absolute top-4 left-4 text-(--t1) z-10 surface-card p-4 text-[12px] shadow-sm backdrop-blur-md bg-(--bg1)/90 pointer-events-auto"
        style={{ width: graphInfoWidth }}
      >
        <div className="font-semibold mb-1 text-(--t0)">
          {t('graphView.mode')}:{' '}
          {layoutMode === 'hierarchy' ? t('graphView.hierarchy') : t('graphView.dependencies')}
        </div>
        <div className="text-(--t2) leading-relaxed">
          {layoutMode === 'hierarchy'
            ? graphInsights?.selectedVisibleId
              ? t('graphView.hierarchySelectedDescription', {
                  incomingCount: graphInsights.incomingCount,
                  outgoingCount: graphInsights.outgoingCount,
                })
              : t('graphView.hierarchyDefaultDescription')
            : graphInsights?.selectedVisibleId
              ? t('graphView.dependenciesSelectedDescription', {
                  incomingCount: graphInsights.incomingCount,
                  outgoingCount: graphInsights.outgoingCount,
                })
              : t('graphView.dependenciesDefaultDescription')}
        </div>
      </div>
      <div className="pointer-events-none absolute right-4 top-4 z-10 flex w-[min(320px,calc(100%-1.25rem))] flex-col gap-4">
        <div className="pointer-events-auto">
          <FilterPanel />
        </div>
      </div>

      <div className="absolute inset-0">
        <TransformWrapper
          initialScale={1}
          minScale={0.05}
          maxScale={5}
          centerOnInit={true}
          limitToBounds={false}
          smooth={false}
          wheel={{ step: 0.045 }}
          pinch={{ step: 4 }}
          zoomAnimation={{ size: 0.18, animationTime: 160, animationType: 'easeOut' }}
        >
          <TransformComponent wrapperClass="w-full h-full">
            {layoutData && (
              <div
                className="relative"
                style={{
                  width: layoutData.width,
                  height: layoutData.height,
                }}
              >
                {/* Edge layer */}
                <svg className="absolute top-0 left-0 w-full h-full pointer-events-none z-1">
                  <defs>
                    <marker
                      id="arrowhead"
                      markerWidth="10"
                      markerHeight="7"
                      refX="9"
                      refY="3.5"
                      orient="auto"
                    >
                      <polygon points="0 0, 10 3.5, 0 7" fill="var(--t3)" />
                    </marker>
                    <marker
                      id="arrowhead-adr"
                      markerWidth="10"
                      markerHeight="7"
                      refX="9"
                      refY="3.5"
                      orient="auto"
                    >
                      <polygon points="0 0, 10 3.5, 0 7" fill="var(--purple)" />
                    </marker>
                  </defs>
                  {edgeElements}
                </svg>

                {/* Node layer */}
                {nodeElements}
              </div>
            )}
          </TransformComponent>
        </TransformWrapper>
      </div>
    </div>
  );
};
