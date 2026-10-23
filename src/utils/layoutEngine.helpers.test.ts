import { describe, expect, it } from 'vitest';
import type { ElkNode } from 'elkjs/lib/elk.bundled.js';
import { buildDependencyElkGraph, buildElkHierarchy, flattenElkTree } from './layoutEngine';
import type { GraphNode } from '../types/graph';

const node = (id: string, type: GraphNode['type'], parentId?: string): GraphNode => ({
  id,
  label: id,
  type,
  group: 1,
  parentId,
});

const indexOf = (nodes: GraphNode[]) => new Map(nodes.map((n) => [n.id, n]));

describe('buildElkHierarchy', () => {
  it('nests nodes under their parent and leaves orphans at the root', () => {
    const nodes = [node('dir', 'directory'), node('file', 'file', 'dir'), node('solo', 'file')];
    const { elkNodesMap, rootChildren } = buildElkHierarchy(indexOf(nodes), indexOf(nodes));

    expect(rootChildren.map((n) => n.id)).toEqual(['dir', 'solo']);
    expect(elkNodesMap.get('dir')?.children?.map((n) => n.id)).toEqual(['file']);
  });

  it('skips hidden ancestors and attaches to the nearest visible one', () => {
    const all = [
      node('dir', 'directory'),
      node('mid', 'directory', 'dir'),
      node('f', 'file', 'mid'),
    ];
    const visible = indexOf(all.filter((n) => n.id !== 'mid'));
    const { elkNodesMap } = buildElkHierarchy(visible, indexOf(all));

    expect(elkNodesMap.get('dir')?.children?.map((n) => n.id)).toEqual(['f']);
  });
});

describe('flattenElkTree', () => {
  it('accumulates parent offsets and marks containers', () => {
    const nodes = [node('dir', 'directory'), node('cls', 'class', 'dir')];
    const tree = {
      id: 'root',
      children: [
        {
          id: 'dir',
          x: 10,
          y: 20,
          width: 100,
          height: 80,
          children: [{ id: 'cls', x: 5, y: 6, width: 30, height: 20 }],
        },
      ],
    } as ElkNode;

    const flat = flattenElkTree(tree, indexOf(nodes));

    expect(flat.map((n) => n.id)).toEqual(['dir', 'cls']);
    expect(flat[1]).toMatchObject({ x: 15, y: 26, width: 30, height: 20, isContainer: false });
    expect(flat[0].isContainer).toBe(true);
  });

  it('ignores ELK nodes that are not visible graph nodes', () => {
    const tree = { id: 'root', children: [{ id: 'ghost', x: 1, y: 1 }] } as ElkNode;
    expect(flattenElkTree(tree, new Map())).toEqual([]);
  });
});

describe('buildDependencyElkGraph', () => {
  const files = [node('b', 'file'), node('a', 'file'), node('c', 'file')];
  const edge = (id: string, from: string, to: string) => ({
    id,
    sources: [from],
    targets: [to],
    data: { source: from, target: to, value: 1 },
  });

  it('uses the box algorithm without edges and the layered one with edges', () => {
    const empty = buildDependencyElkGraph(indexOf(files), [], new Set(), false);
    expect(empty.layoutOptions['elk.algorithm']).toBe('box');
    expect(empty.children.map((n) => n.id)).toEqual(['a', 'b', 'c']);

    const withEdges = buildDependencyElkGraph(
      indexOf(files),
      [edge('e1', 'a', 'b')],
      new Set(),
      false
    );
    expect(withEdges.layoutOptions['elk.algorithm']).toBe('layered');
    expect(withEdges.layoutOptions['elk.spacing.nodeNode']).toBe('56');
  });

  it('narrows nodes and edges to the focused neighbourhood', () => {
    const graph = buildDependencyElkGraph(
      indexOf(files),
      [edge('e1', 'a', 'b'), edge('e2', 'b', 'c')],
      new Set(['a', 'b']),
      true
    );
    expect(graph.children.map((n) => n.id)).toEqual(['a', 'b']);
    expect(graph.edges.map((e) => e.id)).toEqual(['e1']);
    expect(graph.layoutOptions['elk.spacing.nodeNode']).toBe('80');
    expect(graph.layoutOptions['elk.layered.spacing.nodeNodeBetweenLayers']).toBe('140');
  });

  it('lowers layering effort for large graphs', () => {
    const many = Array.from({ length: 81 }, (_, i) => node(`n${i}`, 'file'));
    const graph = buildDependencyElkGraph(indexOf(many), [], new Set(), false);
    expect(graph.layoutOptions['elk.layered.thoroughness']).toBe('1');
  });
});
