import { describe, expect, it } from 'vitest';
import type { GraphData, GraphNode } from '../types/graph';
import { summarizeNode } from './nodeSummary';

const node = (id: string, type: string, extra: Partial<GraphNode> = {}): GraphNode => ({
  id,
  label: id.split('/').pop()!.split('#').pop()!,
  group: 1,
  type,
  ...extra,
});

const graph: GraphData = {
  projectRoot: 'D:/p',
  nodes: [
    node('D:/p/a.ts', 'file', { exports: [{ exportedName: 'doA' }] }),
    node('D:/p/a.ts#doA', 'function'),
    node('D:/p/b.ts', 'file'),
    node('D:/p/b.ts#useA', 'function'),
    node('D:/p/c.ts', 'file'),
    node('D:/p/d.ts', 'file'),
  ],
  links: [
    { source: 'D:/p/b.ts', target: 'D:/p/a.ts#doA', value: 2, type: 'import' },
    { source: 'D:/p/b.ts#useA', target: 'D:/p/a.ts#doA', value: 2, type: 'import' },
    { source: 'D:/p/c.ts', target: 'D:/p/a.ts', value: 1, type: 'import' },
    { source: 'D:/p/a.ts', target: 'D:/p/d.ts', value: 1, type: 'import' },
    { source: 'D:/p/a.ts', target: 'D:/p/a.ts#doA', value: 1, type: 'structure' },
  ],
} as GraphData;

describe('summarizeNode', () => {
  it('folds symbol links into the file and ranks neighbours', () => {
    const summary = summarizeNode(graph, graph.nodes[0]);

    expect(summary.relativePath).toBe('a.ts');
    expect(summary.usedBy.map((item) => item.node.label)).toEqual(['b.ts', 'c.ts']);
    expect(summary.usedBy[0].links).toBe(2);
    expect(summary.dependsOn.map((item) => item.node.label)).toEqual(['d.ts']);
    expect(summary.exportNames).toEqual(['doA']);
  });

  it('does not report a file as its own neighbour or follow structural links', () => {
    const summary = summarizeNode(graph, graph.nodes[0]);
    expect(summary.usedBy.some((item) => item.node.id === 'D:/p/a.ts')).toBe(false);
  });

  it('limits the lists but reports the full totals', () => {
    const summary = summarizeNode(graph, graph.nodes[0], 1);
    expect(summary.usedBy).toHaveLength(1);
    expect(summary.usedByTotal).toBe(2);
  });
});
