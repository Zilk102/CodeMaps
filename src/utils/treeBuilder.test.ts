import { describe, expect, it } from 'vitest';
import type { GraphNode } from '../types/graph';
import { buildTree, hasParentCycle, isNodeHidden } from './treeBuilder';

const node = (id: string, type: string, parentId?: string) =>
  ({ id, type, label: id, parentId }) as unknown as GraphNode;

const all = {
  showDirectories: true,
  showFiles: true,
  showFunctions: true,
  showClasses: true,
  showADR: true,
};

describe('treeBuilder', () => {
  it('hides node types switched off by filters', () => {
    expect(isNodeHidden(node('a', 'file'), { ...all, showFiles: false })).toBe(true);
    expect(isNodeHidden(node('a', 'file'), all)).toBe(false);
    expect(isNodeHidden(node('a', 'other'), all)).toBe(false);
  });

  it('detects parent cycles', () => {
    const nodes = [node('a', 'file', 'b'), node('b', 'file', 'a'), node('c', 'file')];
    expect(hasParentCycle(nodes[0], nodes)).toBe(true);
    expect(hasParentCycle(nodes[2], nodes)).toBe(false);
  });

  it('nests children and roots cyclic nodes', () => {
    const nodes = [node('d', 'directory'), node('f', 'file', 'd'), node('x', 'file', 'x')];
    const tree = buildTree({ nodes, links: [] }, all);
    expect(tree.map((t) => t.data.id)).toEqual(['d', 'x']);
    expect(tree[0].children.map((t) => t.data.id)).toEqual(['f']);
    expect(buildTree(null, all)).toEqual([]);
  });
});
