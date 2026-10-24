/**
 * Pure helpers of the Documentation tab: how coverage is colored and drawn, how languages and
 * file paths are labelled. Kept free of React so the rules can be tested on their own.
 */
import type { DocumentationLanguageItem } from '../../types/documentation';

/** Coverage from which the bar is green. Matches the health score's documentation target. */
export const GOOD_COVERAGE_PERCENT = 80;
/** Coverage below which the bar is red. */
export const POOR_COVERAGE_PERCENT = 50;

/** CSS color variable of a coverage bar: green when well documented, red when poorly. */
export function coverageColor(percent: number): string {
  if (percent >= GOOD_COVERAGE_PERCENT) return 'var(--green)';
  if (percent >= POOR_COVERAGE_PERCENT) return 'var(--orange)';
  return 'var(--red)';
}

/** Tailwind text color class matching {@link coverageColor}, for the big coverage number. */
export function coverageTextClass(percent: number): string {
  if (percent >= GOOD_COVERAGE_PERCENT) return 'text-(--green)';
  if (percent >= POOR_COVERAGE_PERCENT) return 'text-(--orange)';
  return 'text-(--red)';
}

/** Bar width as a CSS percentage, kept within 0-100 even for bad input. */
export function barWidth(percent: number): string {
  const safe = Number.isFinite(percent) ? Math.min(100, Math.max(0, percent)) : 0;
  return `${safe}%`;
}

/** Language id shown to people: `c_sharp` becomes `c sharp`. */
export function languageLabel(language: string): string {
  return language.replace(/_/g, ' ');
}

/** Languages with the most required symbols first; ties by name. */
export function sortLanguages(languages: DocumentationLanguageItem[]): DocumentationLanguageItem[] {
  return [...languages].sort(
    (a, b) => b.requiredSymbols - a.requiredSymbols || a.language.localeCompare(b.language)
  );
}

/** `name:line` label of a symbol with the file shortened to its last segments. */
export function symbolLabel(item: { file: string; line: number; name: string }): string {
  const parts = item.file.replace(/\\/g, '/').split('/').filter(Boolean);
  const shown = parts.length > 2 ? `.../${parts.slice(-2).join('/')}` : parts.join('/');
  return `${shown}:${item.line}  ${item.name}`;
}
