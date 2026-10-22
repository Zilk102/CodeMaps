import { describe, expect, it } from 'vitest';
import type { GraphData, GraphFilters, GraphLink, GraphNode } from '../types/graph';
import { runLayout } from './layoutEngine';

// A project the size of CodeMaps itself: ~230 files with a few hundred import links.
const FILE_COUNT = 230;
const LINK_COUNT = 700;

const filters = {
  showDirectories: true,
  showFiles: true,
  showFunctions: true,
  showClasses: true,
  showADR: true,
  showEdges: true,
} as GraphFilters;

const buildProject = (): GraphData => {
  let seed = 42;
  const next = () => {
    seed = (seed * 1664525 + 1013904223) % 4294967296;
    return seed / 4294967296;
  };

  const nodes: GraphNode[] = [];
  for (let index = 0; index < FILE_COUNT; index += 1) {
    const folder = `D:/proj/area${index % 12}`;
    if (index < 12) {
      nodes.push({ id: folder, label: `area${index}`, group: 0, type: 'directory', churn: 0 });
    }
    nodes.push({
      id: `${folder}/file${index}.ts`,
      label: `file${index}.ts`,
      group: 1,
      type: 'file',
      churn: 0,
      parentId: folder,
    });
  }

  const files = nodes.filter((node) => node.type === 'file');
  const links: GraphLink[] = [];
  for (let index = 0; index < LINK_COUNT; index += 1) {
    const source = files[Math.floor(next() * files.length)];
    const target = files[Math.floor(next() * files.length)];
    if (source.id !== target.id) {
      links.push({ source: source.id, target: target.id, value: 1, type: 'import' });
    }
  }

  return { projectRoot: 'D:/proj', nodes, links } as GraphData;
};

describe('layout speed on a whole-project graph', () => {
  it('lays out the Dependencies overview without freezing the UI', async () => {
    const started = Date.now();
    const result = await runLayout(buildProject(), filters, 'dependencies');
    const elapsed = Date.now() - started;

    expect(result.nodes.length).toBeGreaterThan(FILE_COUNT / 2);
    // It took ~9 s with network-simplex placement; leave generous room for slow CI machines.
    expect(elapsed).toBeLessThan(3000);
  }, 20000);

  it('keeps the hierarchy overview fast too', async () => {
    const started = Date.now();
    await runLayout(buildProject(), filters, 'hierarchy');
    expect(Date.now() - started).toBeLessThan(3000);
  }, 20000);
});
