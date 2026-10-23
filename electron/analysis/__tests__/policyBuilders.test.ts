import * as fs from 'fs/promises';
import * as os from 'os';
import * as path from 'path';
import { afterEach, describe, expect, it } from 'vitest';
import { buildPattern, highWhenAny, type PatternSpec } from '../patternBuilderRunner';
import { readSourceText } from '../sourceText';
import { applyStepRules, stepIfAny, stepWhen } from '../stepRules';

describe('buildPattern', () => {
  const spec: PatternSpec<number> = {
    id: 'big_numbers',
    title: 'Big Numbers',
    description: 'Numbers above ten.',
    severity: highWhenAny((value) => value > 100),
    nodeIds: (values) => values.map(String),
  };

  it('returns null below the minimum count', () => {
    expect(buildPattern([], spec)).toBeNull();
    expect(buildPattern([11, 12], spec, 3)).toBeNull();
  });

  it('builds the pattern in field order and leaves evidence out when the spec has none', () => {
    const pattern = buildPattern([11, 12], spec);
    expect(pattern).toEqual({
      id: 'big_numbers',
      severity: 'medium',
      title: 'Big Numbers',
      description: 'Numbers above ten.',
      nodeIds: ['11', '12'],
    });
    expect(pattern).not.toHaveProperty('evidence');
  });

  it('is high when any finding matches and carries the evidence of the spec', () => {
    const withEvidence = {
      ...spec,
      evidence: (values: number[]) =>
        values.map((value) => ({ nodeId: `n${value}`, message: 'm' })),
    };
    const pattern = buildPattern([5, 500], withEvidence);
    expect(pattern?.severity).toBe('high');
    expect(pattern?.evidence).toEqual([
      { nodeId: 'n5', message: 'm' },
      { nodeId: 'n500', message: 'm' },
    ]);
  });
});

describe('stepRules', () => {
  interface Input {
    items: string[];
    flag: boolean;
  }

  it('applies the rules in order and drops the ones that do not apply', () => {
    const steps = applyStepRules<Input>(
      [
        stepWhen((input) => input.flag, 'flag is set'),
        stepIfAny(
          (input) => input.items,
          (input) => `first item ${input.items[0]}`
        ),
        stepIfAny((input) => input.items.filter((item) => item === 'none'), 'never'),
      ],
      { items: ['a', 'b'], flag: true }
    );
    expect(steps).toEqual(['flag is set', 'first item a']);
  });

  it('yields nothing when no rule applies', () => {
    expect(
      applyStepRules<Input>([stepWhen((input) => input.flag, 'x')], { items: [], flag: false })
    ).toEqual([]);
  });
});

describe('readSourceText', () => {
  let dir = '';

  afterEach(async () => {
    if (dir) await fs.rm(dir, { recursive: true, force: true });
    dir = '';
  });

  it('returns the lower-cased extension and the text of a small file', async () => {
    dir = await fs.mkdtemp(path.join(os.tmpdir(), 'source-text-'));
    const file = path.join(dir, 'Sample.TS');
    await fs.writeFile(file, 'export const a = 1;');
    expect(await readSourceText(file, 1000)).toEqual({
      extension: '.ts',
      text: 'export const a = 1;',
    });
  });

  it('returns null for a file over the limit and for a missing file', async () => {
    dir = await fs.mkdtemp(path.join(os.tmpdir(), 'source-text-'));
    const file = path.join(dir, 'big.py');
    await fs.writeFile(file, 'x'.repeat(50));
    expect(await readSourceText(file, 10)).toBeNull();
    expect(await readSourceText(path.join(dir, 'missing.py'), 10)).toBeNull();
  });
});
