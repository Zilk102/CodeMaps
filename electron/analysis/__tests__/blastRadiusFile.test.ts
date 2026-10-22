import { describe, expect, it } from 'vitest';
import type { GraphData, GraphNode } from '../../store/types';
import { BlastRadiusAnalyzer } from '../BlastRadiusAnalyzer';
import { summarizeBlastRadius } from '../blastRadiusSummary';

const node = (id: string, type: string, parentId?: string): GraphNode => ({
  id,
  label: id.split('#').pop() ?? id,
  group: 1,
  type,
  churn: 1,
  filePath: parentId ?? id,
  parentId,
});

describe('BlastRadiusAnalyzer for file nodes', () => {
  // Imports name symbols (`util.ts#slug`), so nothing points at the file node itself.
  const graph = {
    projectRoot: '/p',
    nodes: [
      node('/p/util.ts', 'file'),
      node('/p/util.ts#slug', 'function', '/p/util.ts'),
      node('/p/util.ts#trim', 'function', '/p/util.ts'),
      node('/p/page.ts', 'file'),
      node('/p/app.ts', 'file'),
    ],
    links: [
      { source: '/p/page.ts', target: '/p/util.ts#slug', value: 2, type: 'import' },
      { source: '/p/app.ts', target: '/p/page.ts', value: 1, type: 'import' },
      // The file's own symbols referring to each other are not dependents.
      { source: '/p/util.ts', target: '/p/util.ts#trim', value: 2, type: 'import' },
    ],
  } as unknown as GraphData;

  it('reaches importers through the symbols the file declares', () => {
    const result = new BlastRadiusAnalyzer().analyze(graph, '/p/util.ts');
    expect(result.directDependents.map((entry) => entry.id)).toEqual(['/p/page.ts']);
    expect(result.affectedNodes.map((entry) => entry.id).sort()).toEqual([
      '/p/app.ts',
      '/p/page.ts',
    ]);
    expect(result.confidence).toBe('high');
  });

  it('reports importers of its symbols as direct dependents in the summary', () => {
    const result = new BlastRadiusAnalyzer().analyze(graph, '/p/util.ts');
    const summary = summarizeBlastRadius(graph, result);
    expect(summary.directFiles.map((entry) => entry.file)).toEqual(['page.ts']);
    expect(summary.transitiveFiles.map((entry) => [entry.file, entry.depth])).toEqual([
      ['app.ts', 2],
    ]);
  });

  it('still analyses a single symbol on its own', () => {
    const result = new BlastRadiusAnalyzer().analyze(graph, '/p/util.ts#trim');
    expect(result.affectedNodes.map((entry) => entry.id)).toEqual(['/p/util.ts']);
  });
});
