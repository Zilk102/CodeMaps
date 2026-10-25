import { describe, expect, it } from 'vitest';
import type { GraphData, GraphFilters, GraphLink, GraphNode, LayoutMode } from '../types/graph';
import { runLayout } from './layoutEngine';

// A project the size of CodeMaps itself: ~230 files with a few hundred import links.
const FILE_COUNT = 230;
const LINK_COUNT = 700;

// ELK loads its wasm on the first call and a shared CI runner is several times slower than a warm
// developer machine, so the measured layout is the second (warm) one and the budget is wider on CI.
// Both values still catch the regression this test exists for: the network-simplex placement took
// about 9 s for this graph.
const LAYOUT_BUDGET_MS = process.env.CI ? 8000 : 3000;

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

/** Milliseconds the warm layout of a whole-project graph takes in `mode`; the first call loads ELK's wasm and is not measured. */
const measureWarmLayout = async (mode: LayoutMode) => {
  await runLayout(buildProject(), filters, mode);

  const started = Date.now();
  const result = await runLayout(buildProject(), filters, mode);
  const elapsed = Date.now() - started;

  expect(result.nodes.length).toBeGreaterThan(FILE_COUNT / 2);
  return elapsed;
};

describe('layout speed on a whole-project graph', () => {
  it.each(['dependencies', 'hierarchy'] as const)(
    'lays out the %s overview without freezing the UI',
    async (mode) => {
      const elapsed = await measureWarmLayout(mode);
      expect(elapsed, `warm ${mode} layout took ${elapsed} ms`).toBeLessThan(LAYOUT_BUDGET_MS);
    },
    40_000
  );
});
