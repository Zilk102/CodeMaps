import { describe, expect, it } from 'vitest';
import type { GraphNode } from '../../store/types';
import { shouldIgnorePath } from '../../oracle/shared';
import { GitChurnAccumulator } from '../../services/gitChurnParser';
import {
  buildSummaryRecommendations,
  calculateRiskScore,
  parseNumstat,
} from '../../services/prImpactSupport';
import { getArchitectureViolationReason } from '../architectureDependencies';
import { scoreCampaignNodeMatch } from '../changeCampaignScoring';
import { buildExecutionWaves, getCampaignBreadth } from '../changeCampaignSupport';
import { scoreNodeTextMatch } from '../nodeMatchScoring';

const node = (id: string, label: string, type = 'file'): GraphNode => ({
  id,
  label,
  group: 1,
  type,
  churn: 0,
});

describe('getArchitectureViolationReason', () => {
  it('allows same-layer, configuration-source and unknown dependencies', () => {
    expect(getArchitectureViolationReason('domain', 'domain')).toBeNull();
    expect(getArchitectureViolationReason('configuration', 'presentation')).toBeNull();
    expect(getArchitectureViolationReason('unknown', 'domain')).toBeNull();
    expect(getArchitectureViolationReason('domain', 'unknown')).toBeNull();
  });

  it('flags upward dependencies on presentation first', () => {
    expect(getArchitectureViolationReason('domain', 'presentation')).toContain('presentation');
    expect(getArchitectureViolationReason('application', 'presentation')).toContain('presentation');
  });

  it('applies the allow-list and forbid-list rules per source layer', () => {
    expect(getArchitectureViolationReason('domain', 'integration')).toContain('Domain');
    expect(getArchitectureViolationReason('domain', 'shared')).toBeNull();
    expect(getArchitectureViolationReason('shared', 'analysis')).toContain('Shared');
    expect(getArchitectureViolationReason('state', 'application')).toContain('State');
    expect(getArchitectureViolationReason('analysis', 'integration')).toContain('Analysis');
    expect(getArchitectureViolationReason('parsing', 'integration')).toContain('Parsing');
    expect(getArchitectureViolationReason('parsing', 'shared')).toBeNull();
    expect(getArchitectureViolationReason('application', 'analysis')).toBeNull();
  });
});

describe('shouldIgnorePath', () => {
  it('ignores generated directories and binary-like files, case-insensitively', () => {
    expect(shouldIgnorePath('C:\\proj\\Node_Modules\\x\\index.js')).toBe(true);
    expect(shouldIgnorePath('/proj/dist-electron/main.js')).toBe(true);
    expect(shouldIgnorePath('/proj/data/app.SQLITE3')).toBe(true);
    expect(shouldIgnorePath('/proj/resources/LICENSES.chromium.html')).toBe(true);
  });

  it('keeps ordinary source files', () => {
    expect(shouldIgnorePath('/proj/src/index.ts')).toBe(false);
    expect(shouldIgnorePath('/proj/out.ts')).toBe(false);
  });
});

describe('scoreNodeTextMatch', () => {
  const weights = {
    labelEquals: 100,
    basenameEquals: { file: 10, other: 1 },
    stemEquals: { file: 20, other: 2 },
    labelStarts: 5,
    basenameStarts: { file: 4, other: 1 },
    stemStarts: { file: 3, other: 1 },
    labelIncludes: 2,
    idIncludes: { file: 7, other: 3 },
  };

  it('returns zero for empty queries and non-matches', () => {
    expect(scoreNodeTextMatch(node('/a/b.ts', 'b.ts'), '   ', weights)).toBe(0);
    expect(scoreNodeTextMatch(node('/a/b.ts', 'b.ts'), 'zzz', weights)).toBe(0);
  });

  it('adds up every satisfied rule using the file or other weight', () => {
    const file = node('/a/Widget.ts', 'Widget.ts');
    // label equals (100) + basename equals (10) + label starts (5) + basename starts (4)
    // + label includes (2) + id includes (7); the stem 'widget' does not equal 'widget.ts'
    expect(scoreNodeTextMatch(file, 'widget.ts', weights)).toBe(100 + 10 + 5 + 4 + 2 + 7);

    const symbol = node('/a/Widget.ts#Widget', 'Widget', 'class');
    // label equals (100) + stem/basename do not equal the whole id's last segment
    expect(scoreNodeTextMatch(symbol, 'widget', weights)).toBeGreaterThan(100);
  });
});

describe('scoreCampaignNodeMatch', () => {
  it('ranks an exact file stem above a partial match and adds the type priority', () => {
    const exact = scoreCampaignNodeMatch(node('/a/auth.ts', 'auth.ts'), 'auth');
    const partial = scoreCampaignNodeMatch(node('/a/authorize.ts', 'authorize.ts'), 'auth');
    expect(exact).toBeGreaterThan(partial);
    expect(scoreCampaignNodeMatch(node('/a/x.ts', 'x.ts'), 'nothing')).toBe(0);
  });
});

describe('campaign execution waves', () => {
  it('groups files by layer, routes unclassified files to the core wave and drops empty waves', () => {
    const files = [node('/a.ts', 'a'), node('/b.ts', 'b'), node('/c.ts', 'c')];
    const layers = new Map([
      ['/a.ts', { nodeId: '/a.ts', layer: 'shared' as const, reason: 'r' }],
      ['/b.ts', { nodeId: '/b.ts', layer: 'presentation' as const, reason: 'r' }],
    ]);
    const waves = buildExecutionWaves(files, layers, []);
    expect(waves.map((wave) => wave.id)).toEqual(['wave-foundation', 'wave-core', 'wave-edge']);
    expect(waves.find((wave) => wave.id === 'wave-core')).toMatchObject({
      layer: 'mixed',
      fileIds: ['/c.ts'],
    });
  });

  it('classifies campaign breadth by file count', () => {
    expect(getCampaignBreadth(3)).toBe('small');
    expect(getCampaignBreadth(8)).toBe('medium');
    expect(getCampaignBreadth(20)).toBe('large');
  });
});

describe('PR impact support', () => {
  const files = (additions: number) => [
    { path: 'a.ts', status: 'modified' as const, additions, deletions: 0 },
  ];

  it('picks the most severe risk level that any threshold exceeds', () => {
    expect(calculateRiskScore(files(10), 0, 0)).toBe('low');
    expect(calculateRiskScore(files(51), 0, 0)).toBe('medium');
    expect(calculateRiskScore(files(10), 11, 0)).toBe('high');
    expect(calculateRiskScore(files(10), 0, 51)).toBe('critical');
  });

  it('parses numstat output and resolves statuses through the callback', () => {
    const parsed = parseNumstat('3\t1\tsrc/a.ts\n-\t-\timg.png\n', (file) =>
      file === 'img.png' ? 'added' : 'modified'
    );
    expect(parsed).toEqual([
      { path: 'src/a.ts', status: 'modified', additions: 3, deletions: 1 },
      { path: 'img.png', status: 'added', additions: 0, deletions: 0 },
    ]);
  });

  it('recommends splitting large PRs and adding tests when none changed', () => {
    expect(buildSummaryRecommendations(files(1), 11)).toEqual([
      expect.stringContaining('Large impact'),
      expect.stringContaining('adding tests'),
    ]);
    expect(buildSummaryRecommendations([{ ...files(1)[0], path: 'a.test.ts' }], 0)).toEqual([
      expect.stringContaining('Tests updated'),
    ]);
    expect(buildSummaryRecommendations(files(1), 0)).toEqual([]);
  });
});

describe('GitChurnAccumulator', () => {
  it('aggregates commits, line counts, authors and last-modified per file', () => {
    const acc = new GitChurnAccumulator('/proj');
    acc.addLine('COMMIT:h1|alice|1000');
    acc.addLine('5\t2\ta.ts');
    acc.addLine('1\t1\ta.ts');
    acc.addLine('');
    acc.addLine('COMMIT:h2|bob|2000');
    acc.addLine('4\t0\ta.ts');
    acc.addLine('2\t2\tb.ts');

    const byName = new Map(
      acc.result().map((churn) => [churn.filePath.replace(/\\/g, '/'), churn])
    );
    const a = [...byName.entries()].find(([key]) => key.endsWith('/proj/a.ts'))![1];
    expect(a.commits).toBe(2);
    expect(a.additions).toBe(10);
    expect(a.deletions).toBe(3);
    expect(a.authors).toEqual(['alice', 'bob']);
    expect(a.lastModified.getTime()).toBe(2000 * 1000);
    expect(acc.result()).toHaveLength(2);
  });
});
