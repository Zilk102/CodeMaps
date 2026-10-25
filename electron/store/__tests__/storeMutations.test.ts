// Guards the project-wide graph store: writes must be O(1) per node (the previous per-node full copy
// of the map made indexing quadratic), revisions must invalidate derived data, and the pending diff
// must describe what changed since it was last taken.
import { describe, expect, it } from 'vitest';
import { oracleStore, runWithIsolatedStore } from '../../store';
import type { GraphNode } from '../../store';

const fileNode = (id: string): GraphNode => ({
  id,
  label: id.split('/').pop() ?? id,
  group: 1,
  type: 'file',
  churn: 0,
  filePath: id,
});

describe('graph store mutations', () => {
  it('upserts nodes into the existing map instead of copying it', async () => {
    await runWithIsolatedStore(async () => {
      const nodes = oracleStore.getState().nodes;
      const revision = oracleStore.getState().nodeRevision;

      oracleStore.getState().upsertNode(fileNode('src/a.ts'));
      oracleStore.getState().upsertNode(fileNode('src/b.ts'));

      expect(oracleStore.getState().nodes).toBe(nodes);
      expect(oracleStore.getState().nodes.size).toBe(2);
      expect(oracleStore.getState().nodeRevision).toBe(revision + 2);
    });
  });

  it('records added nodes in the pending diff and clears it when taken', async () => {
    await runWithIsolatedStore(async () => {
      oracleStore.getState().upsertNode(fileNode('src/a.ts'));
      oracleStore.getState().upsertNode(fileNode('src/b.ts'));

      const diff = oracleStore.getState().getAndResetDiff();
      expect(diff.nodesAdded.map((node) => node.id)).toEqual(['src/a.ts', 'src/b.ts']);
      expect(oracleStore.getState().getAndResetDiff().nodesAdded).toEqual([]);
    });
  });

  it('does not bump the revision when removing something that is not there', async () => {
    await runWithIsolatedStore(async () => {
      const revision = oracleStore.getState().nodeRevision;
      oracleStore.getState().removeNode('src/missing.ts');
      expect(oracleStore.getState().nodeRevision).toBe(revision);
    });
  });

  it('removes every node with a prefix and reports them once', async () => {
    await runWithIsolatedStore(async () => {
      for (const id of ['src/a.ts', 'src/a.ts#run', 'src/a.ts#Stop', 'src/b.ts']) {
        oracleStore.getState().upsertNode(fileNode(id));
      }

      oracleStore.getState().removeNodesPrefix('src/a.ts#');

      expect([...oracleStore.getState().nodes.keys()]).toEqual(['src/a.ts', 'src/b.ts']);
      expect(oracleStore.getState().getAndResetDiff().nodesRemoved).toEqual([
        'src/a.ts#run',
        'src/a.ts#Stop',
      ]);
    });
  });

  it('appends links in place and drops them by source', async () => {
    await runWithIsolatedStore(async () => {
      const links = oracleStore.getState().links;
      oracleStore.getState().addLink({ source: 'src/a.ts', target: 'src/b.ts', value: 1 });
      oracleStore.getState().addLink({ source: 'src/b.ts', target: 'src/c.ts', value: 1 });

      expect(oracleStore.getState().links).toBe(links);
      expect(oracleStore.getState().links).toHaveLength(2);

      oracleStore.getState().removeLinksBySource('src/a.ts');
      expect(oracleStore.getState().links.map((link) => link.source)).toEqual(['src/b.ts']);
      expect(oracleStore.getState().getAndResetDiff().linksRemoved).toEqual([
        { source: 'src/a.ts', target: 'src/b.ts', value: 1 },
      ]);
    });
  });

  it('removes links by type without invalidating readers when nothing matches', async () => {
    await runWithIsolatedStore(async () => {
      oracleStore.getState().addLink({ source: 'a', target: 'b', value: 1, type: 'import' });
      const revision = oracleStore.getState().linkRevision;

      oracleStore.getState().removeLinksByTypes(['framework']);
      expect(oracleStore.getState().linkRevision).toBe(revision);

      oracleStore.getState().removeLinksByTypes(['import']);
      expect(oracleStore.getState().links).toHaveLength(0);
      expect(oracleStore.getState().linkRevision).toBe(revision + 1);
    });
  });
});
