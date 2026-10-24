/**
 * Data model of the headless guard: what a `check` run produces. The report is plain data so the
 * text, GitHub and JSON renderers (and the tests) all read the same thing, and so that the same
 * input always gives byte-identical output.
 */
import type { LegacyDebtSummary } from '../analysis/baseline/types';

/** Output formats of `codemaps-guard check`. */
export const OUTPUT_FORMATS = ['text', 'github', 'json'] as const;

/** One of `OUTPUT_FORMATS`. */
export type OutputFormat = (typeof OUTPUT_FORMATS)[number];

/** One problem at one place: the unit a CI annotation is made of. */
export interface GuardIssue {
  /** Rule id as the MCP tools report it, for example `long_methods` or `missing_documentation`. */
  rule: string;
  /** Whether it fails the run (high severity, or any severity under `--strict`). */
  blocking: boolean;
  severity: 'high' | 'medium' | 'low';
  /** Path relative to the project root, forward slashes. */
  file: string;
  /** First line of the offending code; 1 when only the file is known. */
  line: number;
  message: string;
  /** The same fix hint the MCP tools give an agent. */
  fix: string;
}

/** How the baseline file changed compared with the base ref; it may only shrink. */
export interface BaselineGrowth {
  /** True when an entry was added or a recorded measure went up. */
  grew: boolean;
  /** Fingerprints present now that the base ref did not have. */
  added: string[];
  /** Entries whose recorded measure went up. */
  raised: Array<{ fingerprint: string; from: number; to: number }>;
}

/** Everything one `check` learned, before it is rendered. */
export interface GuardReport {
  /** `changed` when only files changed against the base ref were judged, `project` for all of them. */
  scope: 'changed' | 'project';
  base: string | null;
  mode: 'ratchet' | 'strict';
  /** Whether a baseline was applied (ratchet mode with a baseline file). */
  baselineApplied: boolean;
  strict: boolean;
  /** Source files in the graph. */
  filesIndexed: number;
  /** Changed files judged, relative to the root; empty for a project run. */
  changedFiles: string[];
  issues: GuardIssue[];
  legacyDebt: LegacyDebtSummary | null;
  baselineGrowth: BaselineGrowth | null;
  configWarnings: string[];
  /** True when nothing blocks and the baseline did not grow. */
  ok: boolean;
}
