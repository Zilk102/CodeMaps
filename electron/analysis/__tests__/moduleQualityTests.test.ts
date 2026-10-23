import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { afterAll, describe, expect, it } from 'vitest';
import type { GraphData, GraphNode } from '../../store/types';
import { analyzeModuleQuality } from '../moduleQualityMetrics';

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'codemaps-quality-'));
afterAll(() => fs.rmSync(dir, { recursive: true, force: true }));

const bigSource = Array.from(
  { length: 40 },
  (_, index) => `export function f${index}(a: number) {\n  return a + ${index};\n}\n`
)
  .concat(Array.from({ length: 1700 }, (_, index) => `// line ${index}\n`))
  .join('');

const fileNode = (name: string): GraphNode => {
  const file = path.join(dir, name).replace(/\\/g, '/');
  fs.writeFileSync(file, bigSource);
  return { id: file, label: name, group: 1, type: 'file', churn: 1 };
};

describe('analyzeModuleQuality and test files', () => {
  const graph = {
    projectRoot: dir.replace(/\\/g, '/'),
    nodes: [fileNode('service.ts'), fileNode('service.test.ts')],
    links: [],
  } as unknown as GraphData;

  it('measures a test file like any other', () => {
    const summary = analyzeModuleQuality(graph);
    expect(summary.metrics.map((metric) => metric.node.label).sort()).toEqual([
      'service.test.ts',
      'service.ts',
    ]);
  });

  it('does not report a long test file as a god file or an oversized module', () => {
    const summary = analyzeModuleQuality(graph);
    const labels = (items: Array<{ node: GraphNode }>) => items.map((item) => item.node.label);
    expect(labels(summary.oversizedModules)).toEqual(['service.ts']);
    expect(labels(summary.godFiles)).toEqual(['service.ts']);
  });
});
