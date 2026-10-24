import { describe, expect, it } from 'vitest';
import {
  isBlockingFinding,
  isStrictBlockingFinding,
  validateChanges,
} from '../ChangeValidationService';
import { DetectedPattern } from '../patternDetectionTypes';

const pattern = (
  overrides: Partial<DetectedPattern> & Pick<DetectedPattern, 'id'>
): DetectedPattern => ({
  severity: 'high',
  title: overrides.id,
  description: `${overrides.id} description`,
  nodeIds: [],
  ...overrides,
});

describe('validateChanges', () => {
  const legacyPatterns = [
    pattern({ id: 'god_files', nodeIds: ['D:/p/legacy/Big.ts', 'D:/p/src/NewService.ts'] }),
    pattern({ id: 'long_methods', nodeIds: ['D:/p/legacy/Old.ts'] }),
    pattern({
      id: 'code_clones',
      nodeIds: ['D:/p/src/NewService.ts#parse', 'D:/p/src/Other.ts#parse'],
      evidence: [{ nodeId: 'D:/p/src/NewService.ts#parse', message: 'Duplicated 30 LOC' }],
    }),
    pattern({ id: 'churn_hotspots', nodeIds: ['D:/p/src/NewService.ts'] }),
  ];

  it('reports only problems in the changed files, with a fix hint each', () => {
    const result = validateChanges({
      patterns: legacyPatterns,
      changedFiles: ['D:/p/src/NewService.ts'],
      healthScore: 40,
    });

    expect(result.scope).toBe('changed');
    expect(result.findings.map((finding) => finding.id).sort()).toEqual([
      'code_clones',
      'god_files',
    ]);
    expect(
      result.findings.every((finding) => finding.files.includes('D:/p/src/NewService.ts'))
    ).toBe(true);
    expect(result.findings.every((finding) => finding.fix.length > 0)).toBe(true);
    expect(result.isValid).toBe(false);
  });

  it('does not let unrelated legacy debt block a clean change', () => {
    const result = validateChanges({
      patterns: legacyPatterns,
      changedFiles: ['D:/p/src/Clean.ts'],
      healthScore: 40,
    });

    expect(result.isValid).toBe(true);
    expect(result.findings).toEqual([]);
  });

  it('matches paths regardless of slash style and case', () => {
    const result = validateChanges({
      patterns: legacyPatterns,
      changedFiles: [String.raw`d:\p\SRC\newservice.ts`],
      healthScore: 90,
    });

    expect(result.findings.length).toBeGreaterThan(0);
  });

  it('ignores size findings on test files and churn everywhere', () => {
    const result = validateChanges({
      patterns: [
        pattern({ id: 'god_files', nodeIds: ['D:/p/src/__tests__/Big.test.ts'] }),
        pattern({ id: 'churn_hotspots', nodeIds: ['D:/p/src/__tests__/Big.test.ts'] }),
      ],
      changedFiles: ['D:/p/src/__tests__/Big.test.ts'],
      healthScore: 90,
    });

    expect(result.findings).toEqual([]);
  });

  it('falls back to the whole project when nothing changed', () => {
    const result = validateChanges({ patterns: legacyPatterns, changedFiles: [], healthScore: 90 });

    expect(result.scope).toBe('project');
    expect(result.isValid).toBe(false);
    expect(result.recommendation).toMatch(/changedFiles or baseRef/);
  });
});

describe('strict blocking', () => {
  it('fails on every health-score kind at any severity and keeps hubs and fan-out advisory', () => {
    for (const id of [
      'mixed_responsibility_modules',
      'god_files',
      'code_clones',
      'layer_violations',
    ]) {
      expect(isStrictBlockingFinding({ id, severity: 'medium' })).toBe(true);
    }
    expect(isBlockingFinding({ id: 'mixed_responsibility_modules', severity: 'medium' })).toBe(
      false
    );
    for (const id of ['hub_nodes', 'high_fan_out_files']) {
      expect(isStrictBlockingFinding({ id, severity: 'high' })).toBe(false);
    }
  });
});
