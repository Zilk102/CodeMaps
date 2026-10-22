import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { afterAll, describe, expect, it } from 'vitest';
import { planSplit } from '../symbolClusters/clusterSymbols';
import { extractSymbolGraph } from '../symbolClusters/extractSymbolGraph';
import type { SymbolGraph, SymbolInfo } from '../symbolClusters/types';

const symbol = (
  name: string,
  refs: string[] = [],
  lineCount = 20,
  kind: SymbolInfo['kind'] = 'function'
): SymbolInfo => ({ name, kind, startLine: 1, endLine: lineCount, lineCount, refs });

const graphOf = (symbols: SymbolInfo[], file = '/p/handlers.go', language = 'go'): SymbolGraph => ({
  filePath: file,
  language,
  lineCount: symbols.reduce((sum, item) => sum + item.lineCount, 0),
  symbols,
});

describe('planSplit', () => {
  const users = ['listUsers', 'createUser', 'deleteUser'];
  const orders = ['listOrders', 'createOrder', 'cancelOrder'];
  const symbols = [
    symbol('respondError', [], 5),
    symbol('userStore', ['respondError'], 30, 'type'),
    ...users.map((name) => symbol(name, ['userStore', 'respondError'])),
    symbol('orderStore', ['respondError'], 30, 'type'),
    ...orders.map((name) => symbol(name, ['orderStore', 'respondError'])),
    symbol('Register', [...users, ...orders, 'userStore', 'orderStore', 'respondError'], 12),
    ...Array.from({ length: 6 }, (_, index) => symbol(`handler${index}`, ['respondError'], 8)),
  ];

  it('groups symbols that call each other and keeps unrelated groups apart', () => {
    const plan = planSplit(graphOf(symbols), 'handlers.go')!;
    const clusterOf = (name: string) =>
      plan.clusters.find((cluster) => cluster.symbols.some((item) => item.name === name))?.name;

    expect(clusterOf('listUsers')).toBe(clusterOf('createUser'));
    expect(clusterOf('listUsers')).toBe(clusterOf('userStore'));
    expect(clusterOf('listOrders')).toBe(clusterOf('cancelOrder'));
    expect(clusterOf('listUsers')).not.toBe(clusterOf('listOrders'));
  });

  it('sets aside helpers used everywhere and the symbol that wires everything together', () => {
    const plan = planSplit(graphOf(symbols), 'handlers.go')!;
    expect(plan.sharedHelpers.map((helper) => helper.name)).toContain('respondError');
    expect(plan.orchestrators).toEqual(['Register']);
    const clustered = plan.clusters.flatMap((cluster) => cluster.symbols.map((item) => item.name));
    expect(clustered).not.toContain('respondError');
    expect(clustered).not.toContain('Register');
  });

  it('names clusters after their topic and suggests a file next to the original', () => {
    const plan = planSplit(graphOf(symbols), 'handlers.go')!;
    const names = plan.clusters.map((cluster) => cluster.name);
    expect(names).toEqual(expect.arrayContaining([expect.stringMatching(/user/)]));
    expect(names).toEqual(expect.arrayContaining([expect.stringMatching(/order/)]));
    expect(plan.clusters.every((cluster) => cluster.suggestedFile.endsWith('.go'))).toBe(true);
  });

  it('is deterministic', () => {
    const first = planSplit(graphOf(symbols), 'handlers.go');
    const second = planSplit(graphOf(symbols), 'handlers.go');
    expect(second).toEqual(first);
  });

  it('returns nothing for a file that is too small to split', () => {
    expect(planSplit(graphOf([symbol('a'), symbol('b'), symbol('c')]), 'a.go')).toBeNull();
  });

  it('points at one huge declaration instead of inventing seams', () => {
    const many = [
      symbol('TABLE', [], 900, 'const'),
      ...Array.from({ length: 7 }, (_, index) => symbol(`helper${index}`, ['TABLE'], 10)),
    ];
    const plan = planSplit(graphOf(many, '/p/data.py', 'python'), 'data.py')!;
    expect(plan.heaviest[0]).toMatchObject({ name: 'TABLE', lines: 900 });
    expect(plan.confidence).toBe('low');
  });

  it('uses class-per-file names for Java', () => {
    const java = [
      ...['loadUser', 'saveUser', 'dropUser'].map((name) => symbol(`Repo.${name}`, [], 15)),
      ...['loadOrder', 'saveOrder', 'dropOrder'].map((name) => symbol(`Repo.${name}`, [], 15)),
    ];
    const plan = planSplit(graphOf(java, '/p/Repo.java', 'java'), 'Repo.java')!;
    expect(plan.clusters.every((cluster) => /^[A-Z]\w*\.java$/.test(cluster.suggestedFile))).toBe(
      true
    );
  });
});

describe('extractSymbolGraph', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'codemaps-symbols-'));
  afterAll(() => fs.rmSync(dir, { recursive: true, force: true }));

  const extract = async (name: string, source: string) => {
    const file = path.join(dir, name);
    fs.writeFileSync(file, source);
    const graph = await extractSymbolGraph(file);
    expect(graph).not.toBeNull();
    return new Map(graph!.symbols.map((item) => [item.name, item]));
  };

  it('Go: methods are qualified by receiver and refs include same-file helpers and types', async () => {
    const symbols = await extract(
      'a.go',
      [
        'package a',
        'type Handler struct{}',
        'func helper() int { return 1 }',
        'func (h *Handler) Get() int { return helper() }',
        'func (h *Handler) Put() int { return h.Get() }',
      ].join('\n')
    );
    expect(symbols.get('Handler.Get')?.refs).toEqual(expect.arrayContaining(['Handler', 'helper']));
    expect(symbols.get('Handler.Put')?.refs).toContain('Handler.Get');
  });

  it('Python: counts a large module-level table as its own symbol', async () => {
    const table = Array.from({ length: 12 }, (_, index) => `    "k${index}": ${index},`).join('\n');
    const symbols = await extract(
      'a.py',
      [`PATTERNS = {\n${table}\n}`, 'def lookup(key):', '    return PATTERNS[key]'].join('\n')
    );
    expect(symbols.get('PATTERNS')).toMatchObject({ kind: 'const' });
    expect(symbols.get('PATTERNS')!.lineCount).toBeGreaterThanOrEqual(12);
    expect(symbols.get('lookup')?.refs).toContain('PATTERNS');
  });

  it('Java: methods are qualified by their class', async () => {
    const symbols = await extract(
      'A.java',
      ['class A {', '  int one() { return two(); }', '  int two() { return 2; }', '}'].join('\n')
    );
    expect(symbols.get('A.one')?.refs).toContain('A.two');
  });

  it('Rust: impl functions are qualified by their type', async () => {
    const symbols = await extract(
      'a.rs',
      ['struct S;', 'fn util() {}', 'impl S { fn run(&self) { util(); } }'].join('\n')
    );
    expect(symbols.get('S::run')?.refs).toContain('util');
  });

  it('TypeScript: class methods are symbols and this.method() is a reference', async () => {
    const symbols = await extract(
      'a.ts',
      [
        'const LIMIT = 3;',
        'export class Svc {',
        '  run() { return this.step() + LIMIT; }',
        '  step() { return 1; }',
        '}',
        'export function make() { return new Svc(); }',
      ].join('\n')
    );
    expect(symbols.get('Svc.run')?.refs).toEqual(expect.arrayContaining(['Svc.step', 'LIMIT']));
    expect(symbols.get('make')?.refs).toContain('Svc');
    // The class shell does not own its methods' lines.
    expect(symbols.get('Svc')!.lineCount).toBeLessThan(symbols.get('Svc')!.endLine);
  });
});
