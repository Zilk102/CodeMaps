import { describe, expect, it } from 'vitest';
import {
  applyRatchetToPatterns,
  buildRatchetContext,
  fingerprintFindings,
  type Baseline,
  type FindingDraft,
} from '../baseline';
import type { DetectedPattern } from '../patternDetectionTypes';

const draft = (overrides: Partial<FindingDraft>): FindingDraft => ({
  kind: 'long_function',
  path: 'D:/p/src/a.ts',
  symbol: 'run',
  line: 1,
  measure: 130,
  severity: 'high',
  message: 'run is long',
  ...overrides,
});

const pattern = (id: string, severity: DetectedPattern['severity'] = 'high'): DetectedPattern => ({
  id,
  severity,
  title: id,
  description: `${id} description`,
  nodeIds: ['D:/p/src/a.ts'],
});

const baselineOf = (entries: Record<string, number>): Baseline => ({
  version: 1,
  createdAt: '2026-01-01T00:00:00.000Z',
  entries,
});

describe('applyRatchetToPatterns', () => {
  it('keeps uncovered patterns, drops fully legacy ones and rebuilds the rest from new items', () => {
    const current = fingerprintFindings('D:/p', [
      draft({ symbol: 'old' }),
      draft({ symbol: 'brandNew', path: 'D:/p/src/b.ts' }),
      draft({ kind: 'god_file', symbol: '', path: 'D:/p/src/g.ts', measure: 900 }),
    ]);
    const ratchet = buildRatchetContext(
      baselineOf({
        'long_function|src/a.ts|old': 130,
        'god_file|src/g.ts|': 900,
      }),
      current
    );

    const result = applyRatchetToPatterns(
      [pattern('long_methods'), pattern('god_files'), pattern('hub_nodes', 'medium')],
      ratchet
    );

    expect(result.map((item) => item.id).sort()).toEqual(['hub_nodes', 'long_methods']);
    const longMethods = result.find((item) => item.id === 'long_methods')!;
    expect(longMethods.nodeIds).toEqual(['D:/p/src/b.ts']);
    expect(longMethods.evidence).toHaveLength(1);
  });

  it('rates layer violations high only when there are many new ones', () => {
    const violations = (count: number) =>
      fingerprintFindings(
        'D:/p',
        Array.from({ length: count }, (_, index) =>
          draft({
            kind: 'layer_violation',
            path: `D:/p/src/ui${index}.ts`,
            relatedPath: 'D:/p/src/db.ts',
            symbol: 'src/db.ts',
            measure: 0,
            severity: 'medium',
          })
        )
      );
    const rate = (count: number) =>
      applyRatchetToPatterns(
        [pattern('layer_violations', 'medium')],
        buildRatchetContext(baselineOf({}), violations(count))
      )[0];

    expect(rate(3).severity).toBe('medium');
    expect(rate(3).nodeIds).toContain('D:/p/src/db.ts');
    expect(rate(11).severity).toBe('high');
  });
});
