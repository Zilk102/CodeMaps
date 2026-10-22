import React, { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { TransformWrapper, TransformComponent } from 'react-zoom-pan-pinch';
import { ElkPoint } from 'elkjs/lib/elk.bundled';
import { useGraphStore, useUIStore } from '../store/useStore';
import { useGraphLayout } from '../hooks/useGraphLayout';
import { GraphNodeComponent } from './GraphNodeComponent';
import { GraphControls, GraphHint } from './graph/GraphControls';
import { GraphToolbar } from './graph/GraphToolbar';
import { GraphLegend } from './graph/GraphLegend';
import { NodeDetailsPanel } from './graph/NodeDetailsPanel';
import { useGraphViewport } from '../hooks/useGraphViewport';

// Width taken by the node details panel (320px + margins) when a node is selected.
const DETAILS_PANEL_RESERVE = 344;

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

  const { transformRef, containerRef, fit, zoomBy, markUserMoved } = useGraphViewport({
    layoutData,
    frameKey: `${graphData?.projectRoot ?? ''}|${layoutMode}`,
    focusNodeId: graphInsights?.selectedVisibleId ?? null,
    frameWholeLayout: layoutMode === 'dependencies',
    reserveRight: selectedNode ? DETAILS_PANEL_RESERVE : 0,
  });

  const modeDescription =
    layoutMode === 'hierarchy'
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
        : t('graphView.dependenciesDefaultDescription');

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
      <GraphToolbar modeDescription={modeDescription} help={<GraphLegend />} />
      {isCalculating && (
        <div className="absolute left-1/2 top-16 z-10 -translate-x-1/2 rounded-full border border-(--border) bg-(--bg1)/95 px-4 py-1.5 text-[12px] text-(--acc) shadow-lg backdrop-blur-md">
          {t('graphView.recalculatingGraph')}
        </div>
      )}
      {selectedNode && (
        <div className="pointer-events-none absolute bottom-3 right-3 top-16 z-10 flex w-[320px] flex-col">
          <NodeDetailsPanel
            graph={graphData}
            node={selectedNode}
            onSelect={setSelectedNode}
            onClose={() => setSelectedNode(null)}
          />
        </div>
      )}
      <div className="pointer-events-none absolute bottom-3 left-1/2 z-10 -translate-x-1/2">
        <GraphHint />
      </div>
      <GraphControls
        onFit={() => fit()}
        onZoomIn={() => zoomBy(1.4)}
        onZoomOut={() => zoomBy(1 / 1.4)}
      />

      <div className="absolute inset-0" ref={containerRef}>
        <TransformWrapper
          ref={transformRef}
          onPanningStart={markUserMoved}
          onZoomStart={markUserMoved}
          onPinchStart={markUserMoved}
          initialScale={1}
          minScale={0.05}
          maxScale={5}
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
