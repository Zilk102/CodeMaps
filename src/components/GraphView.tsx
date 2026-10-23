import React from 'react';
import { useTranslation } from 'react-i18next';
import { TransformWrapper, TransformComponent } from 'react-zoom-pan-pinch';
import { useGraphStore, useUIStore } from '../store/useStore';
import { useGraphLayout } from '../hooks/useGraphLayout';
import { GraphControls, GraphHint } from './graph/GraphControls';
import { GraphToolbar } from './graph/GraphToolbar';
import { GraphLegend } from './graph/GraphLegend';
import { NodeDetailsPanel } from './graph/NodeDetailsPanel';
import { GraphEdgeLayer, GraphNodeLayer } from './graph/GraphLayers';
import { getModeDescriptionKey } from './graph/edgeStyle';
import { useGraphViewport } from '../hooks/useGraphViewport';

// Width taken by the node details panel (320px + margins) when a node is selected.
const DETAILS_PANEL_RESERVE = 344;

const CenteredMessage: React.FC<{ className: string; children: React.ReactNode }> = ({
  className,
  children,
}) => (
  <div className={`w-full h-full bg-(--bg0) flex items-center justify-center ${className}`}>
    {children}
  </div>
);

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

  const description = getModeDescriptionKey(layoutMode, graphInsights);
  const modeDescription = description.params
    ? t(description.key, description.params)
    : t(description.key);

  if (error) {
    return (
      <CenteredMessage className="text-(--red)">
        {t('graphView.error')}: {error}
      </CenteredMessage>
    );
  }

  if (!graphData) {
    return (
      <CenteredMessage className="text-(--t1)">
        {t('graphView.openProjectToAnalyze')}
      </CenteredMessage>
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
                <GraphEdgeLayer
                  layoutData={layoutData}
                  layoutMode={layoutMode}
                  graphInsights={graphInsights}
                />

                {/* Node layer */}
                <GraphNodeLayer
                  layoutData={layoutData}
                  layoutMode={layoutMode}
                  graphInsights={graphInsights}
                  selectedNode={selectedNode}
                  onSelectNode={setSelectedNode}
                />
              </div>
            )}
          </TransformComponent>
        </TransformWrapper>
      </div>
    </div>
  );
};
