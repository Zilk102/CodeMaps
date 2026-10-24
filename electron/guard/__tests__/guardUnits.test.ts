/**
 * Unit tests of the guard's pure parts: argument parsing, baseline comparison and the renderers.
 */
import { describe, expect, it } from 'vitest';
import { parseArgs } from '../args';
import { compareBaselines } from '../baselineGrowth';
import { renderGithub, renderText } from '../render';
import type { GuardReport } from '../types';

const baseline = (entries: Record<string, number>) => ({
  version: 1 as const,
  createdAt: '',
  entries,
});

const report = (extra: Partial<GuardReport> = {}): GuardReport => ({
  scope: 'project',
  base: null,
  mode: 'ratchet',
  baselineApplied: true,
  strict: false,
  filesIndexed: 3,
  changedFiles: [],
  issues: [],
  legacyDebt: null,
  baselineGrowth: null,
  configWarnings: [],
  ok: true,
  ...extra,
});

describe('parseArgs', () => {
  it('parses a full check command line', () => {
    const parsed = parseArgs([
      'check',
      '--root',
      'app',
      '--base=origin/main',
      '--format',
      'github',
      '--strict',
    ]);
    expect(parsed).toEqual({
      ok: true,
      args: {
        command: 'check',
        root: 'app',
        base: 'origin/main',
        format: 'github',
        strict: true,
        refresh: false,
      },
    });
  });

  it('rejects unknown commands, options, formats and missing values', () => {
    expect(parseArgs(['publish'])).toMatchObject({ ok: false });
    expect(parseArgs(['check', '--nope'])).toMatchObject({ ok: false });
    expect(parseArgs(['check', '--format', 'xml'])).toMatchObject({ ok: false });
    expect(parseArgs(['check', '--base'])).toMatchObject({ ok: false });
  });

  it('defaults to help without arguments', () => {
    expect(parseArgs([])).toMatchObject({ ok: true, args: { command: 'help' } });
  });
});

describe('compareBaselines', () => {
  it('reports new entries and raised measures but not lowered or removed ones', () => {
    const growth = compareBaselines(
      baseline({ 'a|x|f': 10, 'a|x|g': 20, 'a|x|h': 30 }),
      baseline({ 'a|x|f': 12, 'a|x|g': 15, 'a|x|new': 5 })
    );
    expect(growth.grew).toBe(true);
    expect(growth.added).toEqual(['a|x|new']);
    expect(growth.raised).toEqual([{ fingerprint: 'a|x|f', from: 10, to: 12 }]);
  });

  it('treats a first baseline and a missing baseline as no growth', () => {
    expect(compareBaselines(null, baseline({ 'a|x|f': 1 })).grew).toBe(false);
    expect(compareBaselines(baseline({ 'a|x|f': 1 }), null).grew).toBe(false);
  });
});

describe('renderers', () => {
  const issue = {
    rule: 'long_methods',
    blocking: true,
    severity: 'high' as const,
    file: 'src/a,b.ts',
    line: 7,
    message: 'Too long: 100%\nreally',
    fix: 'Extract helpers.',
  };

  it('escapes workflow command properties and data', () => {
    const output = renderGithub(report({ issues: [issue], ok: false }));
    expect(output).toContain('::error file=src/a%2Cb.ts,line=7,title=long_methods::');
    expect(output).toContain('100%25%0Areally Fix: Extract helpers.');
  });

  it('lists blocking issues first with their fix and ends with the verdict', () => {
    const output = renderText(report({ issues: [issue], ok: false }));
    expect(output).toMatch(/^FAIL src\/a,b\.ts:7 \[long_methods\]/);
    expect(output).toContain('fix: Extract helpers.');
    expect(output.trimEnd().endsWith('Result: FAILED')).toBe(true);
  });

  it('names a growing baseline as a failure', () => {
    const growth = { grew: true, added: ['k|f|s'], raised: [] };
    const output = renderText(report({ baselineGrowth: growth, ok: false }));
    expect(output).toContain('baseline.json grew');
  });
});
