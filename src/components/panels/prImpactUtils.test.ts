import { describe, expect, it } from 'vitest';
import { getFileStatusDotClass, getRiskColor } from './prImpactUtils';

describe('getRiskColor', () => {
  it('maps each known risk level to its own class', () => {
    const classes = ['critical', 'high', 'medium', 'low'].map(getRiskColor);
    expect(new Set(classes).size).toBe(4);
    expect(getRiskColor('critical')).toContain('--red');
    expect(getRiskColor('low')).toContain('--green');
  });

  it('uses a neutral class for unknown levels', () => {
    expect(getRiskColor('weird')).toBe('bg-(--bg2) text-(--t1)');
  });
});

describe('getFileStatusDotClass', () => {
  it('colors added, deleted and other statuses', () => {
    expect(getFileStatusDotClass('added')).toBe('bg-(--green)');
    expect(getFileStatusDotClass('deleted')).toBe('bg-(--red)');
    expect(getFileStatusDotClass('modified')).toBe('bg-(--yellow)');
    expect(getFileStatusDotClass(undefined)).toBe('bg-(--yellow)');
  });
});
