import React from 'react';
import {
  TransformWrapper,
  TransformComponent,
  type ReactZoomPanPinchRef,
} from 'react-zoom-pan-pinch';
import type { LayoutResult } from '../../utils/layoutEngine';
import type { GraphNode, LayoutMode } from '../../types/graph';
import { GraphEdgeLayer, GraphNodeLayer, type GraphInsights } from './GraphLayers';

interface GraphCanvasProps {
  layoutData: LayoutResult | null;
  layoutMode: LayoutMode;
  graphInsights: GraphInsights | null;
  selectedNode: GraphNode | null;
  onSelectNode: (node: GraphNode | null) => void;
  transformRef: React.MutableRefObject<ReactZoomPanPinchRef | null>;
  containerRef: React.MutableRefObject<HTMLDivElement | null>;
  onUserMove: () => void;
}

/** Pan/zoom surface that hosts the edge and node layers. */
export const GraphCanvas: React.FC<GraphCanvasProps> = ({
  layoutData,
  layoutMode,
  graphInsights,
  selectedNode,
  onSelectNode,
  transformRef,
  containerRef,
  onUserMove,
}) => (
  <div className="absolute inset-0" ref={containerRef}>
    <TransformWrapper
      ref={transformRef}
      onPanningStart={onUserMove}
      onZoomStart={onUserMove}
      onPinchStart={onUserMove}
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
              onSelectNode={onSelectNode}
            />
          </div>
        )}
      </TransformComponent>
    </TransformWrapper>
  </div>
);
