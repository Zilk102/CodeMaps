/**
 * Baseline findings about documentation: required symbols without a doc comment and files
 * without a header. They have no size to grow, so their measure is 0 and they are never
 * "worsened"; a legacy one is either still there or paid down.
 */
import type { DocumentationReport } from '../documentation';
import type { FindingDraft } from './types';

/** The symbol part of an undocumented-symbol fingerprint: its kind and name. */
export const undocumentedSymbolKey = (kind: string, name: string): string => `${kind} ${name}`;

/** One draft per undocumented required symbol and per file without a header. */
export const collectDocumentationFindings = (
  report: DocumentationReport | null,
  include: (path: string) => boolean
): FindingDraft[] => {
  if (!report) return [];
  const symbols = report.undocumented
    .filter((symbol) => include(symbol.file))
    .map((symbol): FindingDraft => ({
      kind: 'undocumented_symbol',
      path: symbol.file,
      symbol: undocumentedSymbolKey(symbol.kind, symbol.name),
      line: symbol.line,
      measure: 0,
      severity: 'medium',
      message: `${symbol.kind} ${symbol.name} (line ${symbol.line}) has no doc comment.`,
    }));
  const headers = report.filesWithoutHeader.filter(include).map((file): FindingDraft => ({
    kind: 'missing_header',
    path: file,
    symbol: '',
    line: 0,
    measure: 0,
    severity: 'medium',
    message: 'No header comment.',
  }));
  return [...symbols, ...headers];
};
