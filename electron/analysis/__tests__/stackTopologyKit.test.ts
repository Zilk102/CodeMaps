import { describe, expect, it } from 'vitest';
import { defineAdapter, fanOutLinks, type AdapterSources } from '../stackTopologyAdapterKit';
import { contractBindingLinks } from '../stackTopologyContractLinks';
import {
  extractAspNetRouteMethods,
  extractCSharpMethodNames,
  extractJakartaRouteMethods,
  extractJvmFunctionNames,
  extractMicronautRouteMethods,
  extractSpringRouteMethods,
} from '../stackTopologyJvmExtractors';
import type { StackAdapterContext } from '../stackTopologyTypes';

const sources = (index: Map<string, Set<string>> = new Map()) =>
  ({ graphSymbolIndex: index }) as unknown as AdapterSources;

describe('fanOutLinks', () => {
  it('links every source to every target', () => {
    expect(fanOutLinks(['a', 'b'], ['x', 'y'], 'why')).toEqual([
      { source: 'a', target: 'x', type: 'build', reason: 'why' },
      { source: 'a', target: 'y', type: 'build', reason: 'why' },
      { source: 'b', target: 'x', type: 'build', reason: 'why' },
      { source: 'b', target: 'y', type: 'build', reason: 'why' },
    ]);
  });
});

describe('contractBindingLinks', () => {
  const contract = { filePath: 'api.proto', text: 'Users' };
  const matching = { filePath: 'gen/users.ts', text: '' };
  const other = { filePath: 'gen/orders.ts', text: '' };
  const base = {
    contracts: [contract],
    implementations: [matching, other],
    namesOf: (entry: { text: string }) => [entry.text],
    bind: (implementation: { filePath: string }, name: string) =>
      implementation.filePath.includes(name.toLowerCase()) ? [name] : null,
    type: 'build' as const,
  };

  it('links the file and the symbol of each bound implementation only', () => {
    const links = contractBindingLinks(sources(), {
      ...base,
      fileReason: 'file_reason',
      symbolReason: 'symbol_reason',
    });
    expect(links.map((link) => [link.source, link.target, link.reason])).toEqual([
      ['api.proto', 'gen/users.ts', 'file_reason'],
      ['api.proto', 'gen/users.ts', 'symbol_reason'],
    ]);
  });

  it('emits only the kinds of link that have a reason', () => {
    const fileOnly = contractBindingLinks(sources(), { ...base, fileReason: 'f' });
    const symbolOnly = contractBindingLinks(sources(), { ...base, symbolReason: 's' });
    expect(fileOnly.map((link) => link.reason)).toEqual(['f']);
    expect(symbolOnly.map((link) => link.reason)).toEqual(['s']);
  });

  it('resolves the symbol endpoint with the preferred symbols', () => {
    const index = new Map([['gen/users.ts', new Set(['Users'])]]);
    const [link] = contractBindingLinks(sources(index), { ...base, symbolReason: 's' });
    expect(link.target).toContain('Users');
  });
});

describe('defineAdapter', () => {
  const context = (detected: boolean) =>
    ({
      getDetectedStack: (id: string) => (detected ? { evidence: [`${id}-evidence`] } : undefined),
    }) as unknown as StackAdapterContext;
  const adapter = (find: () => null | { summary: string; details: object }) =>
    defineAdapter({
      id: 'x-topology',
      displayName: 'X',
      category: 'build',
      stackId: 'x',
      alsoEvidence: ['y'],
      find,
    });

  it('supports the contexts that detected the stack', () => {
    const x = adapter(() => null);
    expect(x.supports(context(true))).toBe(true);
    expect(x.supports(context(false))).toBe(false);
  });

  it('reports the evidence of every named stack', async () => {
    const insight = await adapter(() => ({ summary: 's', details: {} })).analyze(context(true));
    expect(insight?.evidence).toEqual(['x-evidence', 'y-evidence']);
    expect(insight?.summary).toBe('s');
  });

  it('returns no insight when nothing is found', async () => {
    expect(await adapter(() => null).analyze(context(true))).toBeNull();
  });
});

describe('JVM method extractors', () => {
  it('finds annotated route methods by framework', () => {
    expect(
      extractSpringRouteMethods('@GetMapping("/a")\n public String list() {}\n@Get\nvoid no() {}')
    ).toEqual(['list']);
    expect(extractMicronautRouteMethods('@Post("/a")\n public Foo create(Foo f) {}')).toEqual([
      'create',
    ]);
    expect(extractJakartaRouteMethods('@GET\n @Path("/")\n public List<A> all() {}')).toEqual([]);
    expect(extractJakartaRouteMethods('@DELETE public void remove() {}')).toEqual(['remove']);
  });

  it('finds ASP.NET actions and C# methods', () => {
    expect(
      extractAspNetRouteMethods('[HttpGet("x")]\n public async Task<IActionResult> Get() {}')
    ).toEqual(['Get']);
    expect(extractCSharpMethodNames('public virtual string Name() {}')).toContain('Name');
  });

  it('finds Kotlin and Java function names', () => {
    const names = extractJvmFunctionNames(
      'suspend fun load() {}\n public static void main(String[] a) {}'
    );
    expect(names).toEqual(expect.arrayContaining(['load', 'main']));
  });
});
