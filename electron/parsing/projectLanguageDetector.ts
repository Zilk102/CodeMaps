import * as path from 'path';
import { getLanguageByExtension } from './languageRegistry';
import { ProjectLanguageProfile } from './types';

export const detectProjectLanguages = (filePaths: string[]): ProjectLanguageProfile => {
  const languageFileCounts: Record<string, number> = {};

  for (const filePath of filePaths) {
    const extension = path.extname(filePath).toLowerCase();
    const language = getLanguageByExtension(extension);
    if (!language) continue;

    languageFileCounts[language.id] = (languageFileCounts[language.id] || 0) + 1;
  }

  const activeLanguageIds = Object.entries(languageFileCounts)
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .map(([languageId]) => languageId);

  return {
    activeLanguageIds,
    languageFileCounts,
  };
};
