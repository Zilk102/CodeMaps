import { describe, expect, it } from 'vitest';
import type { GraphNode } from '../types/graph';
import { buildFileTree, compareEntries, sortedChildren } from './fileTreeModel';

const file = (id: string) => ({ id, label: id, group: 1, type: 'file' }) as GraphNode;

describe('fileTreeModel', () => {
  it('builds nested directories from file ids', () => {
    const tree = buildFileTree({
      projectRoot: 'D:/p',
      nodes: [file('D:/p/src/a.ts'), file('D:/p/b.ts')],
    });
    expect(Object.keys(tree.children!)).toEqual(['src', 'b.ts']);
    expect(tree.children!.src.isDir).toBe(true);
    expect(tree.children!.src.children!['a.ts'].path).toBe('src/a.ts');
    expect(tree.children!['b.ts'].nodeData?.id).toBe('D:/p/b.ts');
  });

  it('sorts directories first then by name', () => {
    const tree = buildFileTree({
      projectRoot: 'D:/p',
      nodes: [file('D:/p/z.ts'), file('D:/p/a.ts'), file('D:/p/dir/x.ts')],
    });
    expect(sortedChildren(tree).map((c) => c.name)).toEqual(['dir', 'a.ts', 'z.ts']);
    expect(compareEntries(tree.children!['a.ts'], tree.children!['a.ts'])).toBe(0);
  });
});
