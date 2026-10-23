import { describe, expect, it } from 'vitest';
import { LanguageProfileTracker } from '../LanguageProfileTracker';

describe('LanguageProfileTracker', () => {
  it('starts empty', () => {
    expect(new LanguageProfileTracker().get()).toEqual({
      activeLanguageIds: [],
      languageFileCounts: {},
    });
  });

  it('counts files per language and orders languages by count', () => {
    const tracker = new LanguageProfileTracker();
    tracker.adjust('/p/a.ts', 1);
    tracker.adjust('/p/b.ts', 1);
    tracker.adjust('/p/c.py', 1);

    const { activeLanguageIds, languageFileCounts } = tracker.get();
    expect(Object.values(languageFileCounts).sort()).toEqual([1, 2]);
    expect(activeLanguageIds).toHaveLength(2);
    expect(languageFileCounts[activeLanguageIds[0]]).toBe(2);
  });

  it('drops a language when its last file is removed', () => {
    const tracker = new LanguageProfileTracker();
    tracker.adjust('/p/a.ts', 1);
    tracker.adjust('/p/a.ts', -1);
    expect(tracker.get()).toEqual({ activeLanguageIds: [], languageFileCounts: {} });
  });

  it('ignores unknown extensions and replaces the profile wholesale', () => {
    const tracker = new LanguageProfileTracker();
    tracker.adjust('/p/data.unknownext', 1);
    expect(tracker.get().activeLanguageIds).toEqual([]);

    const profile = { activeLanguageIds: ['x'], languageFileCounts: { x: 3 } };
    tracker.replace(profile);
    expect(tracker.get()).toBe(profile);
  });
});
