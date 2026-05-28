import { describe, expect, it } from 'vitest';

import { GraphData } from '../../store';
import { createAgentPlaybook, createGraphSummary } from '../utils';

describe('mcp utils', () => {
  it('includes refresh telemetry in graph summary', () => {
    const graph: GraphData = {
      projectRoot: 'd:/PROJECT/sample',
      nodes: [
        {
          id: 'd:/PROJECT/sample/src/app.ts',
          label: 'app.ts',
          group: 1,
          type: 'file',
          churn: 0,
        },
      ],
      links: [],
      refreshTelemetry: {
        watcher: {
          flushCount: 4,
          batchedEventCount: 7,
          coalescedFlushes: 2,
          maxBatchSize: 3,
          lastBatchSize: 2,
          lastEvent: 'change',
          recentBatchSizes: [1, 2, 2, 3],
        },
        enrichment: {
          skippedRefreshes: 1,
          rebuiltRefreshes: 3,
          runtimePriorityRebuilds: 2,
          directoryTriggeredRebuilds: 0,
          avgRefreshLatencyMs: 12.5,
          lastRefreshMode: 'rebuilt',
          lastRefreshReason: 'stack_runtime_path_changed',
          recentLatencyMs: [8, 10, 12, 20],
          recentModes: ['rebuilt', 'rebuilt', 'skipped', 'rebuilt'],
        },
        trends: {
          watcher: {
            coalescingRatio: 0.5,
            batchSizeTrend: 'improving',
          },
          enrichment: {
            skipRate: 0.25,
            runtimePriorityRate: 0.5,
            latencyTrend: 'degrading',
            degraded: true,
          },
        },
      },
    };

    const summary = createGraphSummary(graph);

    expect(summary.projectRoot).toBe('d:/PROJECT/sample');
    expect(summary.nodesCount).toBe(1);
    expect(summary.refreshTelemetry?.watcher.coalescedFlushes).toBe(2);
    expect(summary.refreshTelemetry?.enrichment.runtimePriorityRebuilds).toBe(2);
    expect(summary.refreshTelemetry?.enrichment.avgRefreshLatencyMs).toBe(12.5);
    expect(summary.refreshTelemetry?.trends.enrichment.latencyTrend).toBe('degrading');
    expect(summary.refreshTelemetry?.watcher.recentBatchSizes).toEqual([1, 2, 2, 3]);
  });

  it('teaches agents to route refresh degradation through task context', () => {
    const playbook = createAgentPlaybook();

    expect(
      playbook.rules.some((rule) => rule.includes('refresh latency'))
    ).toBe(true);
  });
});
