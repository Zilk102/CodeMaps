import { describe, expect, it } from 'vitest';

import { GraphData } from '../../store';
import {
  assertProjectDirectory,
  createAgentPlaybook,
  createGraphSummary,
  getNodeDependencies,
  searchGraph,
} from '../utils';

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

    expect(playbook.rules.some((rule) => rule.includes('refresh latency'))).toBe(true);
  });
});

describe('assertProjectDirectory', () => {
  it('accepts an existing directory', () => {
    expect(() => assertProjectDirectory(process.cwd(), process.cwd())).not.toThrow();
  });

  it('rejects a path that does not exist instead of indexing nothing', () => {
    expect(() => assertProjectDirectory('/definitely/not/here', 'not-here')).toThrow(
      /does not exist or is not a directory/
    );
  });

  it('rejects a file path', () => {
    expect(() => assertProjectDirectory(__filename, __filename)).toThrow(/not a directory/);
  });
});

const sampleGraph = (): GraphData =>
  ({
    projectRoot: 'D:/p',
    nodes: [
      { id: 'D:/p/svc/Kuzu.ts', label: 'Kuzu.ts', group: 1, type: 'file', churn: 0 },
      { id: 'D:/p/svc/Kuzu.ts#Kuzu', label: 'Kuzu', group: 2, type: 'class', churn: 0 },
      { id: 'D:/p/svc/Kuzu.ts#KuzuHelper', label: 'KuzuHelper', group: 2, type: 'class', churn: 0 },
      { id: 'D:/p/svc/Kuzu.ts#run', label: 'run', group: 3, type: 'function', churn: 0 },
      { id: 'D:/p/app/main.ts', label: 'main.ts', group: 1, type: 'file', churn: 0 },
      { id: 'D:/p/app/boot.ts', label: 'boot.ts', group: 1, type: 'file', churn: 0 },
    ],
    links: [
      { source: 'D:/p/svc/Kuzu.ts', target: 'D:/p/svc/Kuzu.ts#Kuzu', value: 1, type: 'structure' },
      { source: 'D:/p/app/main.ts', target: 'D:/p/svc/Kuzu.ts#Kuzu', value: 2, type: 'import' },
      { source: 'D:/p/app/main.ts', target: 'D:/p/svc/Kuzu.ts#run', value: 2, type: 'import' },
      { source: 'D:/p/app/boot.ts', target: 'D:/p/svc/Kuzu.ts#Kuzu', value: 2, type: 'import' },
      { source: 'D:/p/svc/Kuzu.ts#run', target: 'D:/p/app/boot.ts', value: 1, type: 'import' },
    ],
  }) as GraphData;

describe('getNodeDependencies for a file node', () => {
  it('covers the symbols inside the file instead of looking unused', () => {
    const result = getNodeDependencies(sampleGraph(), 'D:/p/svc/Kuzu.ts');

    expect(result.dependentFiles).toEqual([
      { file: 'app/main.ts', links: 2 },
      { file: 'app/boot.ts', links: 1 },
    ]);
    expect(result.dependencyFiles).toEqual([{ file: 'app/boot.ts', links: 1 }]);
    expect(result.dependentsTotal).toBe(3);
  });

  it('limits raw links but not the per-file summary', () => {
    const result = getNodeDependencies(sampleGraph(), 'D:/p/svc/Kuzu.ts', 1);

    expect(result.dependents).toHaveLength(1);
    expect(result.dependentFiles).toHaveLength(2);
  });

  it('keeps symbol nodes exact', () => {
    const result = getNodeDependencies(sampleGraph(), 'D:/p/svc/Kuzu.ts#Kuzu');

    expect(result.dependentFiles.map((entry) => entry.file)).toEqual([
      'app/boot.ts',
      'app/main.ts',
    ]);
  });
});

describe('searchGraph ranking', () => {
  it('puts the exact name first and drops symbol matches that only share the file path', () => {
    const labels = searchGraph(sampleGraph(), 'kuzu').map((node) => node.label);

    expect(labels[0]).toBe('Kuzu');
    expect(labels).toContain('Kuzu.ts');
    expect(labels).toContain('KuzuHelper');
    expect(labels).not.toContain('run');
  });

  it('still finds a file by its path', () => {
    const labels = searchGraph(sampleGraph(), 'app/main').map((node) => node.label);
    expect(labels).toEqual(['main.ts']);
  });

  it('honours the type filter and the limit', () => {
    expect(searchGraph(sampleGraph(), 'kuzu', 'class', 1)).toHaveLength(1);
    expect(searchGraph(sampleGraph(), 'kuzu', 'function')).toEqual([]);
  });
});
