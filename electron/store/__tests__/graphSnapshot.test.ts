import { describe, expect, it } from 'vitest';
import { buildValidGraphSnapshot } from '../graphSnapshot';
import type { GraphNode, GraphSnapshotState, RefreshTelemetry } from '../types';

const node = (id: string, extra: Partial<GraphNode> = {}): GraphNode => ({
  id,
  label: id,
  group: 1,
  type: id.includes('#') ? 'function' : 'file',
  churn: 0,
  ...extra,
});

const snapshot = (nodes: GraphNode[], links: Array<[string, string]>) =>
  buildValidGraphSnapshot({
    baseDir: '/p',
    nodes: new Map(nodes.map((n) => [n.id, n])),
    links: links.map(([source, target]) => ({ source, target, value: 1 })),
    refreshTelemetry: {} as RefreshTelemetry,
  } satisfies GraphSnapshotState);

const targets = (result: ReturnType<typeof snapshot>) => result.links.map((l) => l.target);

describe('buildValidGraphSnapshot link resolution', () => {
  it('keeps links to existing nodes and drops dangling ones', () => {
    const result = snapshot(
      [node('/p/a.ts'), node('/p/b.ts')],
      [
        ['/p/a.ts', '/p/b.ts'],
        ['/p/a.ts', '/p/missing.ts'],
      ]
    );
    expect(targets(result)).toEqual(['/p/b.ts']);
  });

  it('resolves extensionless file and index targets', () => {
    const result = snapshot(
      [node('/p/a.ts'), node('/p/lib/index.ts')],
      [
        ['/p/a.ts', '/p/b'],
        ['/p/a.ts', '/p/lib'],
      ]
    );
    expect(targets(result)).toEqual(['/p/lib/index.ts']);
  });

  it('falls back from a missing symbol to its file', () => {
    const result = snapshot([node('/p/a.ts'), node('/p/b.ts')], [['/p/a.ts', '/p/b.ts#gone']]);
    expect(targets(result)).toEqual(['/p/b.ts']);
  });

  it('resolves a symbol through an extensionless file and through a barrel re-export', () => {
    const result = snapshot(
      [
        node('/p/a.ts'),
        node('/p/barrel.ts', { reExports: [{ target: '/p/impl', entities: ['*'] }] }),
        node('/p/impl.ts'),
        node('/p/impl.ts#run'),
      ],
      [
        ['/p/a.ts', '/p/barrel.ts#run'],
        ['/p/a.ts', '/p/impl#run'],
      ]
    );
    expect(targets(result)).toEqual(['/p/impl.ts#run', '/p/impl.ts#run']);
  });

  it('follows renamed exports and survives re-export cycles', () => {
    const result = snapshot(
      [
        node('/p/a.ts'),
        node('/p/x.ts', {
          exports: [{ exportedName: 'pub', localName: 'priv' }],
        }),
        node('/p/x.ts#priv'),
        node('/p/c1.ts', { reExports: [{ target: '/p/c2.ts', entities: ['*'] }] }),
        node('/p/c2.ts', { reExports: [{ target: '/p/c1.ts', entities: ['*'] }] }),
      ],
      [
        ['/p/a.ts', '/p/x.ts#pub'],
        ['/p/a.ts', '/p/c1.ts#nothing'],
      ]
    );
    expect(targets(result)).toEqual(['/p/x.ts#priv', '/p/c1.ts']);
  });
});
