import React from 'react';
import { useTranslation } from 'react-i18next';
import type { GraphData } from '../types/graph';
import { useGraphViewModel } from '../hooks/useGraphViewModel';
import { GraphControls, GraphHint } from './graph/GraphControls';
import { GraphToolbar } from './graph/GraphToolbar';
import { GraphLegend } from './graph/GraphLegend';
import { NodeDetailsPanel } from './graph/NodeDetailsPanel';
import { GraphCanvas } from './graph/GraphCanvas';

const CenteredMessage: React.FC<{ className: string; children: React.ReactNode }> = ({
  className,
  children,
}) => (
  <div className={`w-full h-full bg-(--bg0) flex items-center justify-center ${className}`}>
    {children}
  </div>
);

const CalculatingBadge: React.FC = () => {
  const { t } = useTranslation();
  return (
    <div className="absolute left-1/2 top-16 z-10 -translate-x-1/2 rounded-full border border-(--border) bg-(--bg1)/95 px-4 py-1.5 text-[12px] text-(--acc) shadow-lg backdrop-blur-md">
      {t('graphView.recalculatingGraph')}
    </div>
  );
};

const DetailsDock: React.FC<React.ComponentProps<typeof NodeDetailsPanel>> = (props) => (
  <div className="pointer-events-none absolute bottom-3 right-3 top-16 z-10 flex w-[320px] flex-col">
    <NodeDetailsPanel {...props} />
  </div>
);

const GraphHud: React.FC<{ fit: () => void; zoomBy: (factor: number) => void }> = ({
  fit,
  zoomBy,
}) => (
  <>
    <div className="pointer-events-none absolute bottom-3 left-1/2 z-10 -translate-x-1/2">
      <GraphHint />
    </div>
    <GraphControls
      onFit={() => fit()}
      onZoomIn={() => zoomBy(1.4)}
      onZoomOut={() => zoomBy(1 / 1.4)}
    />
  </>
);

type ViewModel = ReturnType<typeof useGraphViewModel>;

const GraphScene: React.FC<{ graphData: GraphData; model: ViewModel }> = ({ graphData, model }) => {
  const { layoutMode, setSelectedNode, selectedNode, layoutData, isCalculating } = model;
  const { transformRef, containerRef, fit, zoomBy, markUserMoved } = model.viewport;
  return (
    <div className="w-full h-full bg-(--bg0) relative flex overflow-hidden">
      <GraphToolbar modeDescription={model.modeDescription} help={<GraphLegend />} />
      {isCalculating && <CalculatingBadge />}
      {selectedNode && (
        <DetailsDock
          graph={graphData}
          node={selectedNode}
          onSelect={setSelectedNode}
          onClose={() => setSelectedNode(null)}
        />
      )}
      <GraphHud fit={fit} zoomBy={zoomBy} />

      <GraphCanvas
        layoutData={layoutData}
        layoutMode={layoutMode}
        graphInsights={model.graphInsights}
        selectedNode={selectedNode}
        onSelectNode={setSelectedNode}
        transformRef={transformRef}
        containerRef={containerRef}
        onUserMove={markUserMoved}
      />
    </div>
  );
};

export const GraphView: React.FC = () => {
  const { t } = useTranslation();
  const model = useGraphViewModel();
  const { graphData, error } = model;

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

  return <GraphScene graphData={graphData} model={model} />;
};
