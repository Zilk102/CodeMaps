/**
 * Agent- and UI-facing view of a `DocumentationReport`: the bounded answer of the
 * `check_documentation` tool. It adds what a reader needs to act (a per-item hint on what the
 * missing comment must say, a file or folder filter, size limits) and nothing the report lacks.
 */
import type {
  DocumentationOffender,
  DocumentationReport,
  LanguageDocumentationStats,
  LowQualityDoc,
  SymbolKind,
  UndocumentedSymbol,
} from './types';

/** Items returned per list when the caller gives no limit. */
export const DEFAULT_DOCUMENTATION_LIMIT = 25;
/** Hard upper bound of the limit, so one call cannot flood an agent's context. */
export const MAX_DOCUMENTATION_LIMIT = 200;

/** What the comment of a symbol must state, by the kind of the symbol. */
const HINTS: Record<SymbolKind, string> = {
  function:
    'State what it does and why callers need it, the meaning of its inputs and result, and when it fails. Do not repeat the name.',
  method:
    'State what it does and why callers need it, the meaning of its inputs and result, and when it fails. Do not repeat the name.',
  class:
    'State the single responsibility, what state it owns and the rules that must always hold. Do not repeat the name.',
  struct:
    'State what it models, what each field means and the rules that must always hold. Do not repeat the name.',
  interface:
    'State the contract: what implementers must guarantee and what callers may rely on. Do not repeat the name.',
  trait:
    'State the contract: what implementers must guarantee and what callers may rely on. Do not repeat the name.',
  enum: 'State what the values choose between and when each one applies. Do not repeat the name.',
  type: 'State what the type stands for and why it exists as a separate name. Do not repeat the name.',
};

/** The hint for a file that opens without a header comment. */
export const HEADER_HINT =
  'Open the file with a header comment: its purpose, what it owns, and why it exists as a separate file.';

/** The hint for a comment that only restates the name or is too short to help. */
const LOW_QUALITY_HINT =
  'Rewrite the comment to say what the symbol is for, its contract and why it exists; drop words that only repeat the name.';

/** What the comment of a symbol of this kind must state. */
export const documentationHint = (kind: SymbolKind): string => HINTS[kind];

/** An undocumented symbol with the hint on what its comment should state. */
export interface UndocumentedItem extends UndocumentedSymbol {
  hint: string;
}

/** A weak comment with the hint on how to improve it. */
export interface LowQualityItem extends LowQualityDoc {
  hint: string;
}

/** Options of {@link buildDocumentationToolReport}. */
export interface DocumentationToolOptions {
  /** Only this file, or the files below this folder (absolute path, as the graph names files). */
  scope?: string;
  limit?: number;
  includeLowQuality?: boolean;
}

/** The bounded answer of `check_documentation`. */
export interface DocumentationToolReport {
  coveragePercent: number;
  requiredSymbols: number;
  documentedSymbols: number;
  analyzedFiles: number;
  exemptFiles: number;
  commentedOutCodeBlocks: number;
  byLanguage: LanguageDocumentationStats[];
  topOffenders: DocumentationOffender[];
  filesWithoutHeader: { total: number; files: string[]; hint: string };
  undocumented: { total: number; omitted: number; items: UndocumentedItem[] };
  lowQuality?: { total: number; omitted: number; items: LowQualityItem[] };
  /** One sentence telling the agent what to do next. */
  guidance: string;
}

const normalize = (value: string) => value.replace(/\\/g, '/').toLowerCase();

/** Whether `file` is the scope itself or lies below it. */
const isInScope = (file: string, scope: string | undefined): boolean => {
  if (!scope) return true;
  const wanted = normalize(scope).replace(/\/$/, '');
  const actual = normalize(file);
  return actual === wanted || actual.startsWith(`${wanted}/`);
};

const clampLimit = (limit: number | undefined): number =>
  Math.min(MAX_DOCUMENTATION_LIMIT, Math.max(1, Math.floor(limit ?? DEFAULT_DOCUMENTATION_LIMIT)));

/** Totals of a report restricted to some files, derived from the per-file facts. */
const totalsOf = (report: DocumentationReport, scope: string | undefined) => {
  const files = report.files.filter((file) => isInScope(file.file, scope));
  const measured = files.filter((file) => !file.exempt);
  const required = measured.flatMap((file) => file.symbols.filter((symbol) => symbol.required));
  const documented = required.filter((symbol) => symbol.documented).length;
  return {
    analyzedFiles: measured.length,
    exemptFiles: files.length - measured.length,
    requiredSymbols: required.length,
    documentedSymbols: documented,
    coveragePercent:
      required.length === 0 ? 100 : Math.round((documented / required.length) * 1000) / 10,
    commentedOutCodeBlocks: files.reduce((sum, file) => sum + file.commentedOutCode.length, 0),
  };
};

const describeNextStep = (missing: number, headers: number, lowQuality: number): string => {
  if (missing + headers + lowQuality === 0) return 'Documentation is complete; nothing to add.';
  const parts = [
    missing > 0 ? `document ${missing} public symbol(s)` : '',
    headers > 0 ? `add a header comment to ${headers} file(s)` : '',
    lowQuality > 0 ? `rewrite ${lowQuality} comment(s) that say nothing` : '',
  ].filter(Boolean);
  return `Next: ${parts.join(', ')}. Say purpose, contract and why; never repeat the name; do not comment out code.`;
};

/**
 * Builds the bounded `check_documentation` answer from a project report. With a `scope` the
 * coverage and every list describe only that file or folder; the per-language bars and the top
 * offenders are restricted the same way.
 */
export const buildDocumentationToolReport = (
  report: DocumentationReport,
  options: DocumentationToolOptions = {}
): DocumentationToolReport => {
  const { scope, includeLowQuality = false } = options;
  const limit = clampLimit(options.limit);
  const inScope = <T extends { file: string }>(items: T[]): T[] =>
    items.filter((item) => isInScope(item.file, scope));
  const totals = totalsOf(report, scope);
  const undocumented = inScope(report.undocumented);
  const headers = inScope(report.filesWithoutHeader.map((file) => ({ file })));
  const lowQuality = inScope(report.lowQuality);

  return {
    ...totals,
    byLanguage: scope ? languageStats(report, scope) : report.byLanguage,
    topOffenders: offendersOf(report, scope).slice(0, limit),
    filesWithoutHeader: {
      total: headers.length,
      files: headers.slice(0, limit).map((item) => item.file),
      hint: HEADER_HINT,
    },
    undocumented: {
      total: undocumented.length,
      omitted: Math.max(0, undocumented.length - limit),
      items: undocumented
        .slice(0, limit)
        .map((symbol) => ({ ...symbol, hint: documentationHint(symbol.kind) })),
    },
    ...(includeLowQuality
      ? {
          lowQuality: {
            total: lowQuality.length,
            omitted: Math.max(0, lowQuality.length - limit),
            items: lowQuality.slice(0, limit).map((doc) => ({ ...doc, hint: LOW_QUALITY_HINT })),
          },
        }
      : {}),
    guidance: describeNextStep(
      undocumented.length,
      headers.length,
      includeLowQuality ? lowQuality.length : 0
    ),
  };
};

/** Files below the scope with undocumented symbols, the worst first. */
const offendersOf = (report: DocumentationReport, scope: string | undefined) =>
  report.files
    .filter((file) => !file.exempt && isInScope(file.file, scope))
    .map((file): DocumentationOffender => {
      const required = file.symbols.filter((symbol) => symbol.required);
      const missing = required.filter((symbol) => !symbol.documented).length;
      return {
        file: file.file,
        missing,
        required: required.length,
        coverage:
          required.length === 0
            ? 100
            : Math.round(((required.length - missing) / required.length) * 1000) / 10,
      };
    })
    .filter((offender) => offender.missing > 0)
    .sort((a, b) => b.missing - a.missing || a.file.localeCompare(b.file));

/** Per-language coverage recomputed for the files below a scope. */
const languageStats = (
  report: DocumentationReport,
  scope: string
): LanguageDocumentationStats[] => {
  const headerless = new Set(report.filesWithoutHeader.map(normalize));
  const stats = new Map<string, LanguageDocumentationStats>();
  for (const file of report.files) {
    if (file.exempt || !isInScope(file.file, scope)) continue;
    const entry = stats.get(file.language) ?? {
      language: file.language,
      files: 0,
      requiredSymbols: 0,
      documentedSymbols: 0,
      coverage: 100,
      filesWithoutHeader: 0,
    };
    const required = file.symbols.filter((symbol) => symbol.required);
    entry.files += 1;
    entry.requiredSymbols += required.length;
    entry.documentedSymbols += required.filter((symbol) => symbol.documented).length;
    entry.filesWithoutHeader += headerless.has(normalize(file.file)) ? 1 : 0;
    stats.set(file.language, entry);
  }
  return [...stats.values()]
    .map((entry) => ({
      ...entry,
      coverage:
        entry.requiredSymbols === 0
          ? 100
          : Math.round((entry.documentedSymbols / entry.requiredSymbols) * 1000) / 10,
    }))
    .sort((a, b) => a.language.localeCompare(b.language));
};
