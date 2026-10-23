import { describe, expect, it } from 'vitest';
import { buildCollapsedAdjacency, compareScoredNodes, type ScoredNode } from '../AgentContextUtils';
import { evaluateRiskRules, riskWhen, structuralRiskRules } from '../riskRules';
import type { GraphData, GraphNode } from '../../store/types';

const node = (id: string, label: string, type: string): GraphNode =>
  ({ id, label, type }) as unknown as GraphNode;

describe('risk rules', () => {
  const input = { count: 2 };

  it('reports fixed and computed messages only when the rule applies', () => {
    const rules = [
      riskWhen<typeof input>((i) => i.count > 1, 'fixed'),
      riskWhen<typeof input>(
        (i) => i.count > 1,
        (i) => `count ${i.count}`
      ),
      riskWhen<typeof input>((i) => i.count > 5, 'never'),
    ];
    expect(evaluateRiskRules(rules, input, 'fallback')).toEqual(['fixed', 'count 2']);
  });

  it('falls back when no rule applies', () => {
    const rules = [riskWhen<typeof input>((i) => i.count > 5, 'never')];
    expect(evaluateRiskRules(rules, input, 'fallback')).toEqual(['fallback']);
  });

  it('builds the shared violation, hotspot and design smell rules in order', () => {
    const rules = structuralRiskRules<{ v: string[]; p: Array<{ id: string }> }>(
      (i) => ({ violations: i.v, patterns: i.p }),
      { violations: 'V', hotspots: 'H', designSmells: 'D' }
    );
    const run = (v: string[], ids: string[]) =>
      evaluateRiskRules(rules, { v, p: ids.map((id) => ({ id })) }, 'none');
    expect(run([], [])).toEqual(['none']);
    expect(run(['x'], ['god_files'])).toEqual(['V', 'H', 'D']);
    expect(run([], ['di_runtime_contract_hubs'])).toEqual(['H']);
  });
});

describe('collapsed adjacency', () => {
  const graph = {
    nodes: [],
    links: [
      { source: 'a.ts#f', target: 'b.ts' },
      { source: 'a.ts#g', target: 'b.ts#h' },
      { source: 'a.ts', target: 'a.ts#f' },
      { source: 'a.ts', target: 'c.ts' },
    ],
  } as unknown as GraphData;

  it('merges symbol links into unique file links and drops self links', () => {
    const { outgoing, incoming } = buildCollapsedAdjacency(graph);
    expect(outgoing.get('a.ts')).toEqual(['b.ts', 'c.ts']);
    expect(incoming.get('b.ts')).toEqual(['a.ts']);
    expect(outgoing.has('b.ts')).toBe(false);
  });

  it('keeps only the links the caller accepts', () => {
    const { outgoing } = buildCollapsedAdjacency(graph, (_source, target) => target === 'c.ts');
    expect([...outgoing.keys()]).toEqual(['a.ts']);
    expect(outgoing.get('a.ts')).toEqual(['c.ts']);
  });
});

describe('compareScoredNodes', () => {
  it('orders by score, then node type priority, then label', () => {
    const items: ScoredNode[] = [
      { node: node('1', 'b', 'file'), score: 1 },
      { node: node('2', 'a', 'file'), score: 1 },
      { node: node('3', 'z', 'function'), score: 1 },
      { node: node('4', 'q', 'file'), score: 9 },
    ];
    expect(items.sort(compareScoredNodes()).map((item) => item.node.id)).toEqual([
      '4',
      '3',
      '2',
      '1',
    ]);
  });

  it('uses the supplied type priority', () => {
    const items: ScoredNode[] = [
      { node: node('1', 'a', 'file'), score: 1 },
      { node: node('2', 'a', 'function'), score: 1 },
    ];
    const filesFirst = (type: string) => (type === 'file' ? 2 : 1);
    expect(items.sort(compareScoredNodes(filesFirst)).map((item) => item.node.id)).toEqual([
      '1',
      '2',
    ]);
  });
});
