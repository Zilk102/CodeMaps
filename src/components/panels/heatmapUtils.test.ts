import { describe, expect, it } from 'vitest';
import {
  computeSince,
  fileBaseName,
  getHeatColor,
  getHeatWidth,
  summarizeAuthors,
} from './heatmapUtils';

describe('getHeatColor', () => {
  it('walks from blue to red as intensity grows', () => {
    expect(getHeatColor(1, 10)).toContain('blue');
    expect(getHeatColor(3, 10)).toContain('green');
    expect(getHeatColor(5, 10)).toContain('yellow');
    expect(getHeatColor(7, 10)).toContain('orange');
    expect(getHeatColor(10, 10)).toContain('red');
  });

  it('clamps intensity above the maximum', () => {
    expect(getHeatColor(50, 10)).toContain('red');
  });
});

describe('getHeatWidth', () => {
  it('is proportional to commits', () => {
    expect(getHeatWidth(5, 10)).toBe('50%');
  });

  it('never drops below 2%', () => {
    expect(getHeatWidth(0, 10)).toBe('2%');
  });
});

describe('computeSince', () => {
  it('goes back the requested number of days without mutating now', () => {
    const now = new Date(2026, 5, 15, 12, 0, 0);
    const since = computeSince(30, now);
    expect(since.getMonth()).toBe(4);
    expect(since.getDate()).toBe(16);
    expect(now.getMonth()).toBe(5);
    expect(now.getDate()).toBe(15);
  });
});

describe('fileBaseName', () => {
  it('returns the last path segment', () => {
    expect(fileBaseName('src/a/b.ts')).toBe('b.ts');
  });

  it('falls back to the full path for a trailing slash', () => {
    expect(fileBaseName('src/dir/')).toBe('src/dir/');
  });
});

describe('summarizeAuthors', () => {
  it('lists up to three authors', () => {
    expect(summarizeAuthors(['a', 'b'])).toBe('a, b');
  });

  it('counts the remaining authors', () => {
    expect(summarizeAuthors(['a', 'b', 'c', 'd', 'e'])).toBe('a, b, c +2');
  });
});
