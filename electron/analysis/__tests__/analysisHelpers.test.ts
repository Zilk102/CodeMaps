import { describe, expect, it } from 'vitest';
import { inferTaskIntent } from '../taskIntelligenceIntent';
import { summarizeSecurityFindings } from '../securityFindingSummary';
import { uniqueCaptures } from '../stackTopologyExtractorBase';
import { extractSpringBeanBindings } from '../stackTopologyExtractors';
import { UnionFind } from '../clones/cloneUnionFind';
import { rollingHashes, selectPositions } from '../clones/cloneWinnowing';
import type { SecurityFinding } from '../SecurityScanner';

describe('uniqueCaptures', () => {
  it('collects the first group of every pattern once, in match order', () => {
    const text = 'def a(): def b(): def a(): class C';
    expect(uniqueCaptures(text, [/def (\w)/g, /class (\w)/g])).toEqual(['a', 'b', 'C']);
  });

  it('returns nothing when no pattern matches', () => {
    expect(uniqueCaptures('nothing here', [/def (\w)/g])).toEqual([]);
  });
});

describe('summarizeSecurityFindings', () => {
  it('counts the findings per severity', () => {
    const findings = ['critical', 'high', 'high', 'low'].map(
      (severity) => ({ severity }) as unknown as SecurityFinding
    );
    expect(summarizeSecurityFindings(findings)).toEqual({
      total: 4,
      critical: 1,
      high: 2,
      medium: 0,
      low: 1,
    });
  });
});

describe('inferTaskIntent', () => {
  it('prefers security over bugfix when both signals are present', () => {
    const intent = inferTaskIntent('crash in the security layer');
    expect(intent.taskKind).toBe('security');
    expect(intent.reasoning).toEqual([
      'Bugfix/incident signals detected.',
      'Security signals found in the request.',
    ]);
  });

  it('falls back to explore without any signal', () => {
    const intent = inferTaskIntent('hello there');
    expect(intent.taskKind).toBe('explore');
    expect(intent.confidence).toBe('low');
  });
});

describe('extractSpringBeanBindings', () => {
  it('still reads the bean method and its implementation', () => {
    const text = '@Bean public Greeter greeter() { return new FriendlyGreeter(); }';
    expect(extractSpringBeanBindings(text)).toEqual([
      { returnType: 'Greeter', methodName: 'greeter', implementationType: 'FriendlyGreeter' },
    ]);
  });
});

describe('clone building blocks', () => {
  it('unions regions into groups', () => {
    const unionFind = new UnionFind();
    const [a, b, c] = [unionFind.add(), unionFind.add(), unionFind.add()];
    unionFind.union(a, b);
    expect(unionFind.find(a)).toBe(unionFind.find(b));
    expect(unionFind.find(a)).not.toBe(unionFind.find(c));
  });

  it('hashes equal windows equally and winnows to one position per window minimum', () => {
    const hashes = rollingHashes(Int32Array.from([1, 2, 3, 1, 2, 3]), 3);
    expect(hashes[0]).toBe(hashes[3]);
    expect(selectPositions(hashes, 2).length).toBeGreaterThan(0);
  });
});
