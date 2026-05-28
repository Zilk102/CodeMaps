import React, { useMemo, useState } from 'react';
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
  const [isTelemetryExpanded, setIsTelemetryExpanded] = useState(false);
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
  const telemetryHud = useMemo(() => {
    if (!refreshTelemetry) {
      return null;
    }

    return {
      degraded: refreshTelemetry.trends.enrichment.degraded,
      statusLabel: refreshTelemetry.trends.enrichment.degraded
        ? t('graphView.telemetry.statusDegraded')
        : t('graphView.telemetry.statusStable'),
      avgLatencyMs: refreshTelemetry.enrichment.avgRefreshLatencyMs.toFixed(1),
      skipRate: (refreshTelemetry.trends.enrichment.skipRate * 100).toFixed(0),
      coalescingRatio: (refreshTelemetry.trends.watcher.coalescingRatio * 100).toFixed(0),
      latencyTrend: translateTelemetryTrend(refreshTelemetry.trends.enrichment.latencyTrend, t),
      lastRefreshMode: translateRefreshMode(refreshTelemetry.enrichment.lastRefreshMode, t),
      lastRefreshReason: translateRefreshReason(refreshTelemetry.enrichment.lastRefreshReason, t),
      watcherFlushCount: refreshTelemetry.watcher.flushCount,
      lastBatchSize: refreshTelemetry.watcher.lastBatchSize,
      rebuiltRefreshes: refreshTelemetry.enrichment.rebuiltRefreshes,
      skippedRefreshes: refreshTelemetry.enrichment.skippedRefreshes,
      runtimePriorityRebuilds: refreshTelemetry.enrichment.runtimePriorityRebuilds,
      recentBatchSizes:
        refreshTelemetry.watcher.recentBatchSizes
          .slice(-4)
          .join(', ') || t('graphView.telemetry.notAvailable'),
      recentLatencyMs:
        refreshTelemetry.enrichment.recentLatencyMs
          .slice(-4)
          .map((value) => value.toFixed(0))
          .join(', ') || t('graphView.telemetry.notAvailable'),
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
      {telemetryHud && (
        <div className="absolute right-2.5 top-2.5 z-10 w-[min(320px,calc(100%-1.25rem))]">
          <div className="rounded-xl border border-(--border) bg-(--bg1)/95 p-3 text-(--t1) shadow-[0_8px_24px_rgba(0,0,0,0.22)] backdrop-blur-sm">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div
                  className={`inline-flex rounded-full px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.08em] ${
                    telemetryHud.degraded
                      ? 'bg-[rgba(255,107,107,0.14)] text-(--red)'
                      : 'bg-[rgba(68,170,255,0.14)] text-(--acc)'
                  }`}
                >
                  {telemetryHud.statusLabel}
                </div>
                <div className="mt-2 text-[13px] font-semibold text-(--t0)">
                  {t('graphView.refreshTelemetry')}
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsTelemetryExpanded((value) => !value)}
                className="rounded-lg border border-(--border) bg-(--bg2) px-2.5 py-1.5 text-[11px] font-medium text-(--t2) transition-colors hover:border-(--acc) hover:text-(--acc)"
              >
                {isTelemetryExpanded
                  ? t('graphView.telemetry.hideDetails')
                  : t('graphView.telemetry.details')}
              </button>
            </div>

            <div className="mt-3 grid grid-cols-3 gap-2">
              <div className="rounded-lg border border-(--border) bg-(--bg2) px-2.5 py-2">
                <div className="text-[10px] uppercase tracking-[0.08em] text-(--t3)">
                  {t('graphView.telemetry.avgLatency')}
                </div>
                <div className="mt-1 text-[14px] font-semibold text-(--t0)">
                  {telemetryHud.avgLatencyMs} ms
                </div>
              </div>
              <div className="rounded-lg border border-(--border) bg-(--bg2) px-2.5 py-2">
                <div className="text-[10px] uppercase tracking-[0.08em] text-(--t3)">
                  {t('graphView.telemetry.skipRate')}
                </div>
                <div className="mt-1 text-[14px] font-semibold text-(--t0)">
                  {telemetryHud.skipRate}%
                </div>
              </div>
              <div className="rounded-lg border border-(--border) bg-(--bg2) px-2.5 py-2">
                <div className="text-[10px] uppercase tracking-[0.08em] text-(--t3)">
                  {t('graphView.telemetry.coalescing')}
                </div>
                <div className="mt-1 text-[14px] font-semibold text-(--t0)">
                  {telemetryHud.coalescingRatio}%
                </div>
              </div>
            </div>

            <div className="mt-3 flex flex-wrap gap-2">
              <div className="rounded-full border border-(--border) bg-(--bg2) px-2.5 py-1 text-[11px] text-(--t2)">
                {t('graphView.telemetry.trend')}: {telemetryHud.latencyTrend}
              </div>
              <div className="rounded-full border border-(--border) bg-(--bg2) px-2.5 py-1 text-[11px] text-(--t2)">
                {t('graphView.telemetry.lastRefresh')}: {telemetryHud.lastRefreshMode}
              </div>
            </div>

            {isTelemetryExpanded && (
              <div className="mt-3 grid grid-cols-2 gap-2">
                <div className="rounded-lg border border-(--border) bg-(--bg2) px-2.5 py-2">
                  <div className="text-[10px] uppercase tracking-[0.08em] text-(--t3)">
                    {t('graphView.telemetry.watcherFlushes')}
                  </div>
                  <div className="mt-1 text-[13px] font-semibold text-(--t0)">
                    {telemetryHud.watcherFlushCount}
                  </div>
                  <div className="mt-1 text-[11px] text-(--t2)">
                    {t('graphView.telemetry.lastBatch')}: {telemetryHud.lastBatchSize}
                  </div>
                </div>
                <div className="rounded-lg border border-(--border) bg-(--bg2) px-2.5 py-2">
                  <div className="text-[10px] uppercase tracking-[0.08em] text-(--t3)">
                    {t('graphView.telemetry.runtimePriority')}
                  </div>
                  <div className="mt-1 text-[13px] font-semibold text-(--t0)">
                    {telemetryHud.runtimePriorityRebuilds}
                  </div>
                  <div className="mt-1 text-[11px] text-(--t2)">
                    {t('graphView.telemetry.rebuilt')}: {telemetryHud.rebuiltRefreshes} · {t('graphView.telemetry.skipped')}:{' '}
                    {telemetryHud.skippedRefreshes}
                  </div>
                </div>
                <div className="rounded-lg border border-(--border) bg-(--bg2) px-2.5 py-2">
                  <div className="text-[10px] uppercase tracking-[0.08em] text-(--t3)">
                    {t('graphView.telemetry.lastReason')}
                  </div>
                  <div className="mt-1 text-[12px] leading-5 text-(--t0)">
                    {telemetryHud.lastRefreshReason}
                  </div>
                </div>
                <div className="rounded-lg border border-(--border) bg-(--bg2) px-2.5 py-2">
                  <div className="text-[10px] uppercase tracking-[0.08em] text-(--t3)">
                    {t('graphView.telemetry.recentLatency')}
                  </div>
                  <div className="mt-1 text-[12px] leading-5 text-(--t0)">
                    {telemetryHud.recentLatencyMs}
                  </div>
                  <div className="mt-1 text-[11px] text-(--t2)">
                    {t('graphView.telemetry.recentBatches')}: {telemetryHud.recentBatchSizes}
                  </div>
                </div>
              </div>
            )}
          </div>
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
