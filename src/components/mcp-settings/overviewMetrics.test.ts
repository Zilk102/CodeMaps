import { describe, expect, it } from 'vitest';
import type { GraphData } from '../../types/graph';
import { countResources, countTools, graphMetricLabel } from './overviewMetrics';
import type { McpStatus } from './types';

const status = (extra: Partial<McpStatus> = {}): McpStatus => ({
  enabled: true,
  host: 'h',
  port: 1,
  path: '/',
  endpoint: 'e',
  websocketUrl: 'w',
  resources: ['r1', 'r2'],
  tools: ['t1'],
  projectRoot: null,
  nodesCount: 0,
  linksCount: 0,
  ...extra,
});

describe('overviewMetrics', () => {
  it('counts tools and resources with fallbacks', () => {
    expect(countTools(null)).toBe(0);
    expect(countTools(status())).toBe(1);
    expect(countResources(status())).toBe(2);
    expect(countTools(status({ toolDetails: [{ name: 'a', title: '', description: '' }] }))).toBe(
      1
    );
  });

  it('formats the graph label', () => {
    const graph = { nodes: [1, 2, 3], links: [1] } as unknown as GraphData;
    expect(graphMetricLabel(status(), null)).toBe('0 / 0');
    expect(graphMetricLabel(status(), graph)).toBe('3 / 1');
    expect(graphMetricLabel(status({ nodesCount: 9, linksCount: 8 }), graph)).toBe('9 / 8');
  });
});
