/** Tracks which languages the indexed project uses and how many files each has. */

import * as path from 'path';
import { getLanguageByExtension } from '../parsing/languageRegistry';
import { ProjectLanguageProfile } from '../parsing/types';

/** Keeps the per-language file counts of the indexed project in step with watcher events. */
export class LanguageProfileTracker {
  private profile: ProjectLanguageProfile = {
    activeLanguageIds: [],
    languageFileCounts: {},
  };

  /** Current profile: language ids ordered by file count, and the count per language. */
  get(): ProjectLanguageProfile {
    return this.profile;
  }

  /** Replaces the profile wholesale, after a full index of a project. */
  replace(profile: ProjectLanguageProfile) {
    this.profile = profile;
  }

  /** Counts one file of `filePath`'s language more (+1) or less (-1). Unknown extensions are ignored. */
  adjust(filePath: string, delta: 1 | -1) {
    const language = getLanguageByExtension(path.extname(filePath).toLowerCase());
    if (!language) return;

    const nextCounts = { ...this.profile.languageFileCounts };
    const nextCount = (nextCounts[language.id] || 0) + delta;

    if (nextCount <= 0) {
      delete nextCounts[language.id];
    } else {
      nextCounts[language.id] = nextCount;
    }

    this.profile = {
      languageFileCounts: nextCounts,
      activeLanguageIds: Object.entries(nextCounts)
        .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
        .map(([languageId]) => languageId),
    };
  }
}
