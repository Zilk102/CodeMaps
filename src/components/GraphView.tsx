import React, { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { TransformWrapper, TransformComponent } from 'react-zoom-pan-pinch';
import { ElkPoint } from 'elkjs/lib/elk.bundled';
import { useGraphStore, useUIStore } from '../store/useStore';
import { FilterPanel } from './FilterPanel';
import { useGraphLayout } from '../hooks/useGraphLayout';
import { GraphNodeComponent } from './GraphNodeComponent';

const translateTelemetryTrend = (
  trend: 'stable' | 'improving' | 'degrading',
  t: (key: string, options?: Record<string, unknown>) => string
) => t(`graphView.telemetry.trends.${trend}`);

const translateRefreshMode = (
  mode: 'skipped' | 'rebuilt' | null,
  t: (key: string, options?: Record<string, unknown>) => string
) => (mode ? t(`graphView.telemetry.modes.${mode}`) : t('graphView.telemetry.notAvailable'));

const translateRefreshReason = (
  reason: 'no_stack_impact' | 'directory_structure_changed' | 'stack_runtime_path_changed' | null,
  t: (key: string, options?: Record<string, unknown>) => string
) => (reason ? t(`graphView.telemetry.reasons.${reason}`) : t('graphView.telemetry.notAvailable'));

export const GraphView: React.FC = () => {
  const { t } = useTranslation();
  const {
    graphData,
    error,
    filters,
    layoutMode,
    setSelectedNode,
    selectedNode,
  } = useGraphStore();

  const {
    layoutData,
    setLayoutData,
  } = useUIStore();

  const { isCalculating, graphInsights } = useGraphLayout(
    graphData,
    filters,
    layoutMode,
    selectedNode,
    setLayoutData,
    layoutData
  );
  const refreshTelemetry = graphData?.refreshTelemetry;
  const telemetrySummary = useMemo(() => {
    if (!refreshTelemetry) {
      return null;
    }

    return {
      watcherLine: t('graphView.telemetry.watcherLine', {
        flushCount: refreshTelemetry.watcher.flushCount,
        coalescedFlushes: refreshTelemetry.watcher.coalescedFlushes,
        maxBatchSize: refreshTelemetry.watcher.maxBatchSize,
      }),
      enrichmentLine: t('graphView.telemetry.enrichmentLine', {
        rebuiltRefreshes: refreshTelemetry.enrichment.rebuiltRefreshes,
        skippedRefreshes: refreshTelemetry.enrichment.skippedRefreshes,
        runtimePriorityRebuilds: refreshTelemetry.enrichment.runtimePriorityRebuilds,
      }),
      latencyLine: t('graphView.telemetry.latencyLine', {
        avgRefreshLatencyMs: refreshTelemetry.enrichment.avgRefreshLatencyMs.toFixed(1),
        lastRefreshMode: translateRefreshMode(refreshTelemetry.enrichment.lastRefreshMode, t),
        lastRefreshReason: translateRefreshReason(refreshTelemetry.enrichment.lastRefreshReason, t),
      }),
      trendLine: t('graphView.telemetry.trendLine', {
        latencyTrend: translateTelemetryTrend(refreshTelemetry.trends.enrichment.latencyTrend, t),
        skipRate: (refreshTelemetry.trends.enrichment.skipRate * 100).toFixed(0),
        coalescingRatio: (refreshTelemetry.trends.watcher.coalescingRatio * 100).toFixed(0),
      }),
      historyLine: t('graphView.telemetry.historyLine', {
        recentBatchSizes:
          refreshTelemetry.watcher.recentBatchSizes.join(', ') ||
          t('graphView.telemetry.notAvailable'),
        recentLatencyMs:
          refreshTelemetry.enrichment.recentLatencyMs
            .map((value) => value.toFixed(0))
            .join(', ') || t('graphView.telemetry.notAvailable'),
      }),
      degraded: refreshTelemetry.trends.enrichment.degraded,
    };
  }, [refreshTelemetry, t]);

  const edgeElements = useMemo(() => {
    if (!layoutData?.edges) return null;
    return layoutData.edges.map(edge => {
      const isConnectedToSelection = graphInsights?.selectedVisibleId
        ? edge.sourceId === graphInsights.selectedVisibleId || edge.targetId === graphInsights.selectedVisibleId
        : false;
      if (layoutMode === 'hierarchy' && graphInsights?.selectedVisibleId && !isConnectedToSelection) {
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
        ? (isAdr ? 3.5 : isFramework || isBuild ? 2.8 : 2.4)
        : (isAdr ? 2.4 : isFramework || isBuild ? 1.8 : 1.2);
      const strokeDasharray = isAdr ? '5,5' : isBuild ? '7,4' : isFramework ? '3,4' : 'none';
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
    });
  }, [layoutData, layoutMode, graphInsights]);

  const nodeElements = useMemo(() => {
    if (!layoutData?.nodes) return null;
    return layoutData.nodes.map(node => (
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
        className="absolute top-2.5 left-2.5 text-(--t1) z-10 bg-(--bg1) px-3 py-2 rounded-lg border border-(--border) text-xs"
        style={{ width: 'min(420px, calc(100% - 260px))' }}
      >
        <div className="font-bold mb-1">
          {t('graphView.mode')}: {layoutMode === 'hierarchy' ? t('graphView.hierarchy') : t('graphView.dependencies')}
        </div>
        <div className="text-(--t2) leading-snug">
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
      {telemetrySummary && (
        <div
          className="absolute left-2.5 text-(--t1) z-10 bg-(--bg1) px-3 py-2 rounded-lg border border-(--border) leading-snug"
          style={{ top: '6.5rem', width: 'min(460px, calc(100% - 260px))', fontSize: '11px' }}
        >
          <div className={telemetrySummary.degraded ? 'font-bold mb-1 text-(--red)' : 'font-bold mb-1 text-(--acc)'}>
            {t('graphView.refreshTelemetry')}
          </div>
          <div className="text-(--t2)">{telemetrySummary.watcherLine}</div>
          <div className="text-(--t2)">{telemetrySummary.enrichmentLine}</div>
          <div className="text-(--t2)">{telemetrySummary.latencyLine}</div>
          <div className="text-(--t2)">{telemetrySummary.trendLine}</div>
          <div className="text-(--t2)">{telemetrySummary.historyLine}</div>
        </div>
      )}
      
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
                  height: layoutData.height 
                }}>
                {/* Edge layer */}
                <svg className="absolute top-0 left-0 w-full h-full pointer-events-none z-1">
                  <defs>
                    <marker id="arrowhead" markerWidth="10" markerHeight="7" refX="9" refY="3.5" orient="auto">
                      <polygon points="0 0, 10 3.5, 0 7" fill="var(--t3)" />
                    </marker>
                    <marker id="arrowhead-adr" markerWidth="10" markerHeight="7" refX="9" refY="3.5" orient="auto">
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
      <FilterPanel />
    </div>
  );
};
