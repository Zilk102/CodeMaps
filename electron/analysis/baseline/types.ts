/**
 * Types of the baseline ("ratchet"): the findings CodeMaps measures, their stable fingerprints,
 * and the file that remembers the findings an old codebase already had.
 */

/** Everything CodeMaps can put in a baseline. */
export type FindingKind =
  | 'long_function'
  | 'complex_function'
  | 'deep_function'
  | 'god_class'
  | 'god_file'
  | 'oversized_module'
  | 'mixed_responsibility'
  | 'high_fan_out'
  | 'clone'
  | 'layer_violation'
  | 'undocumented_symbol'
  | 'missing_header';

/** How urgent a finding is; `high` findings block a change in validation. */
export type FindingSeverity = 'high' | 'medium' | 'low';

/**
 * A finding as a detector produces it, before it gets a fingerprint. `line` only orders findings
 * of the same name so that their fingerprints are numbered deterministically; it never becomes
 * part of a fingerprint.
 */
export interface FindingDraft {
  kind: FindingKind;
  /** Absolute path (graph id form) of the file the finding is about. */
  path: string;
  /** The file this finding depends on, for findings that concern two files (layer violations). */
  relatedPath?: string;
  /** Name of the function, class or symbol; empty for findings about the whole file. */
  symbol: string;
  line: number;
  /** How bad the finding is, higher is worse: lines, complexity, duplicate size, ... */
  measure: number;
  severity: FindingSeverity;
  message: string;
}

/** A finding with its fingerprint, the identity the baseline remembers it by. */
export interface CurrentFinding extends Omit<FindingDraft, 'line'> {
  /** Path relative to the project root, forward slashes. */
  file: string;
  /** `kind|file|symbol`, plus `#n` for the n-th finding of the same name in a file. No line numbers. */
  fingerprint: string;
}

/** The content of `<project>/.codemaps/baseline.json`. */
export interface Baseline {
  version: 1;
  createdAt: string;
  /** Fingerprint to the measure the finding had when it was last recorded. */
  entries: Record<string, number>;
}

/**
 * Current findings sorted against a baseline: `fresh` are not in it, `worsened` are in it but have
 * a larger measure now, `legacy` are in it unchanged or better.
 */
export interface Classification {
  fresh: CurrentFinding[];
  legacy: CurrentFinding[];
  worsened: CurrentFinding[];
}

/** Counts per finding kind; kinds with no entries are left out. */
export type KindCounts = Partial<Record<FindingKind, number>>;

/** The compact picture of the old debt: how much remains, how much was paid down. */
export interface LegacyDebtSummary {
  /** Findings that exist in the baseline and are not worse than recorded. */
  total: number;
  byKind: KindCounts;
  /** Findings in the baseline that are gone now. */
  paidDown: { total: number; byKind: KindCounts };
  /** Baselined findings that got worse; they are reported as findings, not as debt. */
  worsened: number;
  baselineCreatedAt: string;
}
