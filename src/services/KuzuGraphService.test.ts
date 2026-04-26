import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { KuzuGraphService } from '../../electron/services/KuzuGraphService';

describe('KuzuGraphService', () => {
  let service: KuzuGraphService;

  beforeAll(async () => {
    service = new KuzuGraphService('/tmp/test-codemaps');
    await service.init();
  });

  afterAll(async () => {
    await service.close();
  });

  it('should add and query nodes', async () => {
    await service.addNode({
      id: 'test-file',
      type: 'file',
      label: 'Test File',
      filePath: '/test/file.ts',
      line: 10,
      column: 5,
      language: 'typescript',
    });

    const nodes = await service.queryNodes('file');
    expect(nodes.length).toBe(1);
    expect(nodes[0]['n.id']).toBe('test-file');
    expect(nodes[0]['n.label']).toBe('Test File');
  });

  it('should add and query edges', async () => {
    await service.addNode({
      id: 'file-a',
      type: 'file',
      label: 'File A',
      filePath: '/test/a.ts',
    });

    await service.addNode({
      id: 'file-b',
      type: 'file',
      label: 'File B',
      filePath: '/test/b.ts',
    });

    await service.addEdge({
      sourceId: 'file-a',
      targetId: 'file-b',
      type: 'imports',
    });

    const neighbors = await service.queryNeighbors('file-a');
    expect(neighbors.length).toBe(1);
    expect(neighbors[0]['m.id']).toBe('file-b');
    expect(neighbors[0]['edgeType']).toBe('imports');
  });

  it('should return stats', async () => {
    const stats = await service.getStats();
    expect(stats.nodes).toBeGreaterThan(0);
    expect(stats.edges).toBeGreaterThan(0);
  });
});
