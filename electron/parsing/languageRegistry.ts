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

export const getAllLanguageDefinitions = () => ALL_LANGUAGES;

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

export const getLanguageById = (id: string) => languageById.get(id);

export const getLanguageByExtension = (extension: string) =>
  languageByExtension.get(extension.toLowerCase());
