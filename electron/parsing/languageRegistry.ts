// Lookup of language definitions by id and by file extension.

import { LanguageDefinition } from './types';
import { BUILTIN_LANGUAGE_DEFINITIONS } from './languageCatalog';

const ALL_LANGUAGES: LanguageDefinition[] = BUILTIN_LANGUAGE_DEFINITIONS;

const languageById = new Map(ALL_LANGUAGES.map((language) => [language.id, language]));
const languageByExtension = new Map<string, LanguageDefinition>();

for (const language of ALL_LANGUAGES) {
  for (const extension of language.extensions) {
    languageByExtension.set(extension, language);
  }
}

/** Every supported language definition. */
export const getAllLanguageDefinitions = () => ALL_LANGUAGES;

/**
 * Public view of the supported languages (no grammar or query), for documentation and the
 * capabilities report.
 */
export const getLanguageSupportMatrix = () =>
  ALL_LANGUAGES.map(
    ({ id, displayName, adapterId, supportTier, parserEngine, extensions, capabilities }) => ({
      id,
      displayName,
      adapterId,
      supportTier,
      parserEngine,
      extensions,
      capabilities,
    })
  );

/** Definition with this id, or undefined. */
export const getLanguageById = (id: string) => languageById.get(id);

/**
 * Definition for a file extension including the dot (`.ts`); case-insensitive. Undefined for
 * unknown extensions.
 */
export const getLanguageByExtension = (extension: string) =>
  languageByExtension.get(extension.toLowerCase());
