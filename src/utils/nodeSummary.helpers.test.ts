import { describe, expect, it } from 'vitest';
import type { GraphNode } from '../types/graph';
import { collectOwnIds, countNeighbourLinks } from './nodeSummary';

const n = (id: string, type: string) => ({ id, label: id, group: 1, type }) as GraphNode;

describe('nodeSummary helpers', () => {
  it('collects symbols of a file and children of a directory', () => {
    const nodes = [n('d', 'directory'), n('d/a.ts', 'file'), n('d/a.ts#f', 'function')];
    expect([...collectOwnIds(nodes, nodes[1])]).toEqual(['d/a.ts', 'd/a.ts#f']);
    expect(collectOwnIds(nodes, nodes[0]).size).toBe(3);
    expect(collectOwnIds(nodes, nodes[2]).size).toBe(1);
  });

  it('counts incoming and outgoing links per outside file', () => {
    const own = new Set(['a']);
    const links = [
      { source: 'b', target: 'a', value: 1, type: 'import' },
      { source: 'a', target: 'c', value: 1, type: 'import' },
      { source: 'a', target: 'a', value: 1, type: 'import' },
      { source: 'x', target: 'a', value: 1, type: 'structure' },
    ] as never;
    const { usedBy, dependsOn } = countNeighbourLinks(links, own, 'a', (id) => id);
    expect([...usedBy]).toEqual([['b', 1]]);
    expect([...dependsOn]).toEqual([['c', 1]]);
  });
});
