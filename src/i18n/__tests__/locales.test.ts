import { describe, expect, it } from 'vitest';
import en from '../locales/en.json';
import ru from '../locales/ru.json';
import zh from '../locales/zh.json';

type Catalogue = Record<string, unknown>;

const flatten = (value: Catalogue, prefix = ''): Record<string, string> =>
  Object.entries(value).reduce<Record<string, string>>((acc, [key, child]) => {
    if (child && typeof child === 'object' && !Array.isArray(child)) {
      return { ...acc, ...flatten(child as Catalogue, `${prefix}${key}.`) };
    }
    acc[`${prefix}${key}`] = String(child);
    return acc;
  }, {});

const englishKeys = flatten(en as Catalogue);
const translations = { ru: flatten(ru as Catalogue), zh: flatten(zh as Catalogue) };

// Product names are deliberately identical across locales.
const UNTRANSLATED_BY_DESIGN = new Set([
  'mcpSettings.trae',
  'mcpSettings.cursor',
  'mcpSettings.claudeCode',
]);

const INTERPOLATION = /\{\{\s*([\w.]+)\s*\}\}/g;

const placeholders = (value: string) =>
  [...value.matchAll(INTERPOLATION)].map((match) => match[1]).sort();

describe.each(Object.entries(translations))('%s locale', (_name, catalogue) => {
  it('defines every English key and no extras', () => {
    expect(Object.keys(catalogue).sort()).toEqual(Object.keys(englishKeys).sort());
  });

  it('keeps the same interpolation placeholders as English', () => {
    for (const [key, english] of Object.entries(englishKeys)) {
      expect(placeholders(catalogue[key]), `placeholders differ for ${key}`).toEqual(
        placeholders(english)
      );
    }
  });

  it('has no strings left in English', () => {
    const untranslated = Object.keys(englishKeys).filter(
      (key) =>
        !UNTRANSLATED_BY_DESIGN.has(key) &&
        englishKeys[key].length > 3 &&
        catalogue[key] === englishKeys[key]
    );

    expect(untranslated).toEqual([]);
  });
});
