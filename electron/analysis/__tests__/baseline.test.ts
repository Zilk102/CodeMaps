import * as fs from 'fs';
import { afterEach, describe, expect, it } from 'vitest';
import {
  baselineFromFindings,
  baselinePath,
  classifyFindings,
  fingerprintFindings,
  readBaseline,
  shrinkBaseline,
  summarizeLegacyDebt,
  type Baseline,
  type CurrentFinding,
  type FindingDraft,
} from '../baseline';
import { TestProject } from './projectKit';

let project: TestProject;
afterEach(() => project?.dispose());

const draft = (overrides: Partial<FindingDraft> = {}): FindingDraft => ({
  kind: 'long_function',
  path: 'D:/p/src/a.ts',
  symbol: 'run',
  line: 10,
  measure: 80,
  severity: 'medium',
  message: 'run is long',
  ...overrides,
});

const findings = (drafts: FindingDraft[]): CurrentFinding[] => fingerprintFindings('D:/p', drafts);

describe('fingerprints', () => {
  it('are made of kind, relative file and symbol, without line numbers', () => {
    const [finding] = findings([draft()]);

    expect(finding.fingerprint).toBe('long_function|src/a.ts|run');
    expect(finding.file).toBe('src/a.ts');
  });

  it('do not change when lines shift', () => {
    const before = findings([draft({ line: 10 }), draft({ symbol: 'stop', line: 50 })]);
    const after = findings([draft({ line: 130 }), draft({ symbol: 'stop', line: 190 })]);

    expect(after.map((item) => item.fingerprint)).toEqual(before.map((item) => item.fingerprint));
  });

  it('number findings of the same name in order of appearance', () => {
    const result = findings([draft({ line: 40 }), draft({ line: 5 }), draft({ line: 20 })]);

    expect(result.map((item) => item.fingerprint)).toEqual([
      'long_function|src/a.ts|run',
      'long_function|src/a.ts|run#2',
      'long_function|src/a.ts|run#3',
    ]);
  });
});

describe('classifyFindings', () => {
  const baseline: Baseline = {
    version: 1,
    createdAt: '2026-01-01T00:00:00.000Z',
    entries: {
      'long_function|src/a.ts|run': 80,
      'long_function|src/a.ts|stop': 90,
      'missing_header|src/b.ts|': 0,
    },
  };

  it('sorts findings into fresh, legacy and worsened', () => {
    const current = findings([
      draft({ measure: 80 }),
      draft({ symbol: 'stop', measure: 95 }),
      draft({ symbol: 'start', measure: 70 }),
      draft({ kind: 'missing_header', path: 'D:/p/src/b.ts', symbol: '', measure: 0 }),
    ]);
    const result = classifyFindings(current, baseline);

    expect(result.legacy.map((item) => item.symbol)).toEqual(['run', '']);
    expect(result.worsened.map((item) => item.symbol)).toEqual(['stop']);
    expect(result.fresh.map((item) => item.symbol)).toEqual(['start']);
  });

  it('counts a finding that improved as legacy', () => {
    const result = classifyFindings(findings([draft({ measure: 61 })]), baseline);

    expect(result.legacy).toHaveLength(1);
    expect(result.worsened).toEqual([]);
  });

  it('treats everything as fresh without a baseline', () => {
    const result = classifyFindings(findings([draft(), draft({ symbol: 'x' })]), null);

    expect(result.fresh).toHaveLength(2);
    expect(result.legacy).toEqual([]);
  });
});

describe('legacy debt summary', () => {
  it('counts what remains per kind and what was paid down, without listing items', () => {
    const baseline: Baseline = {
      version: 1,
      createdAt: '2026-01-01T00:00:00.000Z',
      entries: {
        'long_function|src/a.ts|run': 80,
        'long_function|src/a.ts|gone': 70,
        'clone|src/c.ts|helper': 12,
        'god_file|src/g.ts|': 900,
      },
    };
    const current = findings([
      draft(),
      draft({ kind: 'clone', path: 'D:/p/src/c.ts', symbol: 'helper', measure: 12 }),
      draft({ kind: 'god_file', path: 'D:/p/src/g.ts', symbol: '', measure: 950 }),
    ]);
    const summary = summarizeLegacyDebt(baseline, classifyFindings(current, baseline), current);

    expect(summary.total).toBe(2);
    expect(summary.byKind).toEqual({ long_function: 1, clone: 1 });
    expect(summary.paidDown).toEqual({ total: 1, byKind: { long_function: 1 } });
    expect(summary.worsened).toBe(1);
    expect(JSON.stringify(summary)).not.toContain('src/a.ts');
  });
});

describe('baseline file', () => {
  it('is written sorted, read back and tolerant of damage', () => {
    project = new TestProject();
    const created = baselineFromFindings(
      fingerprintFindings(project.root, [
        draft({ path: `${project.root}/src/z.ts`, symbol: 'z' }),
        draft({ path: `${project.root}/src/a.ts`, symbol: 'a' }),
      ]),
      new Date('2026-02-03T00:00:00.000Z')
    );
    project.writeCodemaps('baseline.json', JSON.stringify(created));

    expect(readBaseline(project.root)).toEqual(created);

    project.writeCodemaps('baseline.json', '{ broken');
    expect(readBaseline(project.root)).toBeNull();
    project.writeCodemaps('baseline.json', JSON.stringify({ entries: { a: 'x' } }));
    expect(readBaseline(project.root)).toBeNull();
    expect(readBaseline(undefined)).toBeNull();
  });
});

describe('shrinkBaseline', () => {
  const setup = () => {
    project = new TestProject();
    const initial = fingerprintFindings(project.root, [
      draft({ path: `${project.root}/src/a.ts`, symbol: 'kept', measure: 100 }),
      draft({ path: `${project.root}/src/a.ts`, symbol: 'improved', measure: 100 }),
      draft({ path: `${project.root}/src/a.ts`, symbol: 'worse', measure: 100 }),
      draft({ path: `${project.root}/src/a.ts`, symbol: 'fixed', measure: 100 }),
    ]);
    project.writeCodemaps('baseline.json', JSON.stringify(baselineFromFindings(initial)));
    return project.root;
  };

  it('drops what is gone, lowers what improved and never adds or raises', () => {
    const root = setup();
    const now = fingerprintFindings(root, [
      draft({ path: `${root}/src/a.ts`, symbol: 'kept', measure: 100 }),
      draft({ path: `${root}/src/a.ts`, symbol: 'improved', measure: 70 }),
      draft({ path: `${root}/src/a.ts`, symbol: 'worse', measure: 140 }),
      draft({ path: `${root}/src/a.ts`, symbol: 'brand-new', measure: 10 }),
    ]);

    const result = shrinkBaseline(root, now);
    const entries = readBaseline(root)!.entries;

    expect(result).toEqual({ removed: 1, tightened: 1, remaining: 3 });
    expect(entries).toEqual({
      'long_function|src/a.ts|kept': 100,
      'long_function|src/a.ts|improved': 70,
      'long_function|src/a.ts|worse': 100,
    });
  });

  it('leaves the file untouched when nothing changed and does nothing without a baseline', () => {
    const root = setup();
    const before = fs.readFileSync(baselinePath(root), 'utf-8');
    const unchanged = classifyFindings(
      fingerprintFindings(root, [
        draft({ path: `${root}/src/a.ts`, symbol: 'kept', measure: 100 }),
        draft({ path: `${root}/src/a.ts`, symbol: 'improved', measure: 100 }),
        draft({ path: `${root}/src/a.ts`, symbol: 'worse', measure: 100 }),
        draft({ path: `${root}/src/a.ts`, symbol: 'fixed', measure: 100 }),
      ]),
      readBaseline(root)
    ).legacy;

    expect(shrinkBaseline(root, unchanged).removed).toBe(0);
    expect(fs.readFileSync(baselinePath(root), 'utf-8')).toBe(before);

    fs.rmSync(baselinePath(root));
    expect(shrinkBaseline(root, unchanged)).toEqual({ removed: 0, tightened: 0, remaining: 0 });
    expect(fs.existsSync(baselinePath(root))).toBe(false);
  });
});
