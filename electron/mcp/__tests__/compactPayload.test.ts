import { describe, expect, it } from 'vitest';
import { compactPayload } from '../compactPayload';
import { okCompactStatusToolResult, okStatusToolResult } from '../toolSupport';

const bigPayload = () => ({
  taskResult: {
    patterns: Array.from({ length: 200 }, (_, i) => ({
      id: `pattern-${i}`,
      nodeIds: Array.from({ length: 80 }, (_, j) => `D:/project/src/module-${i}/file-${j}.ts`),
      description: 'x'.repeat(2000),
    })),
    summary: 'short',
  },
});

describe('compactPayload', () => {
  it('cuts arrays to the requested limit and reports what was omitted', () => {
    const { payload, compaction } = compactPayload({ items: [1, 2, 3, 4, 5, 6] }, { maxItems: 4 });
    expect(payload.items).toEqual([1, 2, 3, 4]);
    expect(compaction).toMatchObject({ omittedItems: 2 });
    expect(compaction?.arrays[0]).toEqual({ path: 'items', total: 6, kept: 4 });
  });

  it('leaves small payloads untouched and reports nothing', () => {
    const input = { a: [1, 2], b: 'text', c: { d: true } };
    const { payload, compaction } = compactPayload(input, { maxItems: 10 });
    expect(payload).toEqual(input);
    expect(compaction).toBeNull();
  });

  it('shortens long strings', () => {
    const { payload, compaction } = compactPayload(
      { text: 'a'.repeat(1000) },
      { maxItems: 5, maxStringLength: 50 }
    );
    expect(payload.text).toHaveLength(51);
    expect(compaction?.truncatedStrings).toBe(1);
  });

  it('shrinks the item limit until the payload fits the size cap', () => {
    const { payload, compaction } = compactPayload(bigPayload(), {
      maxItems: 50,
      maxChars: 6000,
    });
    expect(JSON.stringify(payload).length).toBeLessThanOrEqual(6000);
    expect(compaction?.maxItemsApplied).toBeLessThan(50);
  });
});

describe('compactPayload dedupe', () => {
  it('replaces a repeated large sub-tree with a pointer to its first occurrence', () => {
    const block = { layers: Array.from({ length: 5 }, (_, i) => `layer-${i}-${'x'.repeat(200)}`) };
    const { payload, compaction } = compactPayload(
      { projectContext: { architecture: block }, selectedContext: { architecture: block } },
      { maxItems: 10, maxStringLength: 500 }
    );
    expect(payload.selectedContext.architecture.layers).toEqual({
      $sameAs: 'projectContext.architecture.layers',
    });
    expect(compaction?.dedupedSubtrees).toBe(1);
  });
});

describe('okCompactStatusToolResult', () => {
  it('returns more detail for a larger limit', () => {
    const small = okCompactStatusToolResult(bigPayload(), 3).content[0].text.length;
    const large = okCompactStatusToolResult(bigPayload(), 30).content[0].text.length;
    expect(large).toBeGreaterThan(small);
  });

  it('keeps a huge prepare_* payload within a fixed budget and respects limit', () => {
    const result = okCompactStatusToolResult(bigPayload(), 5);
    const text = result.content[0].text;
    const parsed = JSON.parse(text);

    expect(parsed.status).toBe('ok');
    expect(parsed.taskResult.patterns.length).toBeLessThanOrEqual(5);
    expect(parsed._compaction.omittedItems).toBeGreaterThan(0);
    expect(text.length).toBeLessThanOrEqual(8_000 + 2_000 * 5);
    expect(text).not.toContain('\n  ');
  });
});

describe('okStatusToolResult default bounding', () => {
  const hugeList = () => ({
    impact: Array.from({ length: 5000 }, (_, i) => ({
      id: `node-${i}`,
      path: `D:/project/src/deep/module-${i}/file-${i}.ts`,
      note: 'x'.repeat(300),
    })),
  });

  it('keeps an unbounded-looking tool response inside the size budget', () => {
    const text = okStatusToolResult(hugeList()).content[0].text;
    expect(text.length).toBeLessThanOrEqual(45_000);
    expect(JSON.parse(text)._compaction.omittedItems).toBeGreaterThan(0);
  });

  it('passes a deliberately complete payload through untouched', () => {
    const skeleton = 'declare function a(): void;\n'.repeat(500);
    const parsed = JSON.parse(
      okStatusToolResult({ skeleton }, { unbounded: true }).content[0].text
    );
    expect(parsed.skeleton).toBe(skeleton);
    expect(parsed._compaction).toBeUndefined();
  });
});
