import { describe, expect, it } from 'vitest';
import en from '../../i18n/locales/en.json';
import ru from '../../i18n/locales/ru.json';
import zh from '../../i18n/locales/zh.json';
import {
  barWidth,
  coverageColor,
  coverageTextClass,
  languageLabel,
  sortLanguages,
  symbolLabel,
} from './documentationUtils';

describe('coverage colors', () => {
  it.each([
    [100, 'var(--green)', 'text-(--green)'],
    [80, 'var(--green)', 'text-(--green)'],
    [79, 'var(--orange)', 'text-(--orange)'],
    [50, 'var(--orange)', 'text-(--orange)'],
    [49.9, 'var(--red)', 'text-(--red)'],
  ])('%s%% is drawn %s', (percent, color, textClass) => {
    expect(coverageColor(percent)).toBe(color);
    expect(coverageTextClass(percent)).toBe(textClass);
  });
});

describe('barWidth', () => {
  it('clamps to 0-100 and survives bad input', () => {
    expect(barWidth(42.5)).toBe('42.5%');
    expect(barWidth(180)).toBe('100%');
    expect(barWidth(-3)).toBe('0%');
    expect(barWidth(Number.NaN)).toBe('0%');
  });
});

describe('labels', () => {
  it('turns language ids into words', () => {
    expect(languageLabel('c_sharp')).toBe('c sharp');
  });

  it('shortens a symbol location to its last two path segments', () => {
    expect(symbolLabel({ file: 'D:\\p\\src\\deep\\a.ts', line: 7, name: 'run' })).toBe(
      '.../deep/a.ts:7  run'
    );
    expect(symbolLabel({ file: 'a.ts', line: 1, name: 'x' })).toBe('a.ts:1  x');
  });

  it('sorts languages by size, then name', () => {
    const entry = (language: string, requiredSymbols: number) => ({
      language,
      files: 1,
      requiredSymbols,
      documentedSymbols: 0,
      coverage: 0,
      filesWithoutHeader: 0,
    });
    expect(
      sortLanguages([entry('go', 2), entry('rust', 9), entry('c', 2)]).map((l) => l.language)
    ).toEqual(['rust', 'c', 'go']);
  });
});

describe('Documentation tab strings', () => {
  const keys = [
    'title',
    'hint',
    'analyze',
    'analyzing',
    'error',
    'coverage',
    'undocumented',
    'missingHeaders',
    'lowQuality',
    'byLanguage',
    'topOffenders',
    'symbols',
    'headersList',
    'empty',
    'omitted',
    'missingCount',
    'filesCount',
    'selectFile',
    'notInGraph',
    'hintLabel',
  ];

  it.each([
    ['en', en],
    ['ru', ru],
    ['zh', zh],
  ])('%s has every key the panel and the tab list use', (_name, locale) => {
    const section = locale.documentation as Record<string, string>;
    for (const key of keys) expect(section[key], `documentation.${key}`).toBeTruthy();
    const tools = locale.tools as Record<string, string | Record<string, string>>;
    expect(tools.documentation).toBeTruthy();
    expect(tools.documentationEyebrow).toBeTruthy();
    expect(tools.documentationDescription).toBeTruthy();
    const quick = tools.quickActions as Record<string, string>;
    expect(quick.docs).toBeTruthy();
    expect(quick.documentationDescription).toBeTruthy();
    expect(locale.mcpSettings.tools).toHaveProperty('check_documentation');
  });
});
