import { describe, expect, it } from 'vitest';
import { hasPendingUpdate, isDownloadingUpdate, type UpdateState } from './useUpdaterState';

const base: UpdateState = { checking: false, available: false, downloaded: false };

describe('useUpdaterState helpers', () => {
  it('detects pending updates', () => {
    expect(hasPendingUpdate(null)).toBe(false);
    expect(hasPendingUpdate(base)).toBe(false);
    expect(hasPendingUpdate({ ...base, available: true })).toBe(true);
    expect(hasPendingUpdate({ ...base, downloaded: true })).toBe(true);
  });

  it('detects an in-flight download', () => {
    expect(isDownloadingUpdate(null)).toBe(false);
    expect(isDownloadingUpdate({ ...base, available: true })).toBe(false);
    expect(isDownloadingUpdate({ ...base, available: true, progress: 0 })).toBe(false);
    expect(isDownloadingUpdate({ ...base, available: true, progress: 10 })).toBe(true);
    expect(isDownloadingUpdate({ ...base, available: true, downloaded: true, progress: 10 })).toBe(
      false
    );
  });
});
