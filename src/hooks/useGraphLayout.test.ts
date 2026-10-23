import { describe, expect, it } from 'vitest';
import type { GraphData, GraphNode } from '../types/graph';
import type { LayoutResult } from '../utils/layoutEngine';
import { computeGraphInsights } from './useGraphLayout';

const gnode = (id: string, parentId?: string) =>
  ({ id, label: id, group: 1, type: 'file', parentId }) as GraphNode;

const graph = { projectRoot: '/p', nodes: [gnode('a'), gnode('b'), gnode('c')], links: [] };
const layout = {
  nodes: [{ id: 'a' }, { id: 'b' }, { id: 'c' }],
  edges: [
    { sourceId: 'a', targetId: 'b' },
    { sourceId: 'c', targetId: 'a' },
    { sourceId: 'b', targetId: 'c' },
  ],
} as unknown as LayoutResult;

describe('computeGraphInsights', () => {
  it('returns empty insights without a selection', () => {
    const result = computeGraphInsights(graph as unknown as GraphData, layout, null);
    expect(result.selectedVisibleId).toBeNull();
    expect(result.connectedEdges).toEqual([]);
    expect(result.relatedNodeIds.size).toBe(0);
  });

  it('counts incoming and outgoing edges of the selection', () => {
    const result = computeGraphInsights(graph as unknown as GraphData, layout, gnode('a'));
    expect(result.selectedVisibleId).toBe('a');
    expect(result.incomingCount).toBe(1);
    expect(result.outgoingCount).toBe(1);
    expect([...result.relatedNodeIds].sort()).toEqual(['a', 'b', 'c']);
  });
});
