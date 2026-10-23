import { describe, expect, it } from 'vitest';
import { progressPercent } from './AppParts';

describe('progressPercent', () => {
  it('computes a percentage', () => {
    expect(progressPercent(1, 4)).toBe(25);
    expect(progressPercent(0, 10)).toBe(0);
  });
});
