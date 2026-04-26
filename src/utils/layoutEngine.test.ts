import { describe, it, expect } from 'vitest';
import { runLayout } from './layoutEngine';
import type { GraphData } from '../types/graph';

describe('layoutEngine', () => {
  it('should return empty nodes and edges for empty graph', async () => {
    const emptyGraph: GraphData = {
      nodes: [],
      links: [],
      projectRoot: '/test/project'
    };
    
    const result = await runLayout(emptyGraph, {
      showDirectories: true,
      showFiles: true,
      showFunctions: true,
      showClasses: true,
      showADR: true,
      showEdges: true
    }, 'hierarchy');
    expect(result.nodes.length).toBe(1);
    expect(result.nodes[0].id).toBe('__project_root__');
    expect(result.edges).toEqual([]);
  });

  it('should process basic graph nodes', async () => {
    const basicGraph: GraphData = {
      nodes: [
        { id: '1', label: 'Node 1', type: 'file', group: 1 }
      ],
      links: [],
      projectRoot: '/test/project'
    };
    
    const result = await runLayout(basicGraph, {
      showDirectories: true,
      showFiles: true,
      showFunctions: true,
      showClasses: true,
      showADR: true,
      showEdges: true
    }, 'dependencies');
    expect(result.nodes.length).toBeGreaterThan(0);
  });
});
