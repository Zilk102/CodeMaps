import { describe, expect, it } from 'vitest';
import { GraphData, GraphLink, GraphNode } from '../../store/types';
import { BlastRadiusAnalyzer } from '../BlastRadiusAnalyzer';
import { summarizeBlastRadius } from '../blastRadiusSummary';

const node = (id: string, type = 'file'): GraphNode => ({
  id,
  label: id.split('/').pop()!.split('#').pop()!,
  group: 1,
  type,
  churn: 0,
});

const imports = (source: string, target: string): GraphLink => ({
  source,
  target,
  value: 2,
  type: 'import',
});

const root = 'D:/p';
const graph: GraphData = {
  projectRoot: root,
  nodes: [
    node(`${root}/core/types.ts`),
    node(`${root}/core/types.ts#Model`, 'class'),
    node(`${root}/svc/a.ts`),
    node(`${root}/svc/b.ts`),
    node(`${root}/svc/__tests__/a.test.ts`),
    node(`${root}/ui/panel.ts`),
    node(`${root}/ui/page.ts`),
  ],
  links: [
    imports(`${root}/svc/a.ts`, `${root}/core/types.ts#Model`),
    imports(`${root}/svc/b.ts`, `${root}/core/types.ts#Model`),
    imports(`${root}/svc/__tests__/a.test.ts`, `${root}/core/types.ts#Model`),
    imports(`${root}/ui/panel.ts`, `${root}/svc/a.ts`),
    imports(`${root}/ui/page.ts`, `${root}/ui/panel.ts`),
  ],
} as GraphData;

const summarize = (limit?: number) => {
  const result = new BlastRadiusAnalyzer().analyze(graph, `${root}/core/types.ts#Model`, 5);
  return summarizeBlastRadius(graph, result, limit);
};

describe('summarizeBlastRadius', () => {
  it('separates direct dependents from indirect ones and counts them by area', () => {
    const summary = summarize();

    expect(summary.counts.directFiles).toBe(3);
    expect(summary.counts.transitiveFiles).toBe(2);
    expect(summary.counts.testFiles).toBe(1);
    expect(summary.byArea).toEqual(
      [
        { area: 'svc', direct: 2, transitive: 0, tests: 0 },
        { area: 'ui', direct: 0, transitive: 2, tests: 0 },
        { area: 'svc/__tests__', direct: 1, transitive: 0, tests: 1 },
      ].sort(
        (a, b) =>
          b.direct + b.transitive - (a.direct + a.transitive) || a.area.localeCompare(b.area)
      )
    );
  });

  it('lists real files before tests and nearest indirect files with their depth', () => {
    const summary = summarize();

    expect(summary.directFiles.map((entry) => entry.file)).toEqual([
      'svc/a.ts',
      'svc/b.ts',
      'svc/__tests__/a.test.ts',
    ]);
    expect(summary.transitiveFiles).toEqual([
      { file: 'ui/panel.ts', depth: 2, test: false },
      { file: 'ui/page.ts', depth: 3, test: false },
    ]);
  });

  it('caps the lists at the limit but keeps complete counts', () => {
    const summary = summarize(1);

    expect(summary.directFiles).toHaveLength(1);
    expect(summary.omitted).toEqual({ directFiles: 2, transitiveFiles: 1, areas: 0 });
    expect(summary.counts.directFiles).toBe(3);
  });

  it('is far smaller than the raw node-level result for a hub', () => {
    const hubNodes = Array.from({ length: 300 }, (_, index) =>
      node(`${root}/m${index}/file${index}.ts`)
    );
    const hubGraph: GraphData = {
      projectRoot: root,
      nodes: [node(`${root}/core/hub.ts#Hub`, 'class'), ...hubNodes],
      links: hubNodes.map((target) => imports(target.id, `${root}/core/hub.ts#Hub`)),
    } as GraphData;
    const raw = new BlastRadiusAnalyzer().analyze(hubGraph, `${root}/core/hub.ts#Hub`, 3);

    const summary = summarizeBlastRadius(hubGraph, raw);

    expect(JSON.stringify(summary).length).toBeLessThan(JSON.stringify(raw).length / 5);
    expect(summary.counts.directFiles).toBe(300);
  });
});
