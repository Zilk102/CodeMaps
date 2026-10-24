/**
 * Checks whether an agent's edits introduced or touched code problems, by narrowing project-wide
 * pattern findings to the changed files.
 */
import {
  applyRatchetToDocumentation,
  applyRatchetToPatterns,
  type RatchetContext,
} from './baseline/ratchet';
import type { LegacyDebtSummary } from './baseline/types';
import type { DocumentationReport } from './documentation';
import {
  documentationFindingForChanges,
  documentationFindingForProject,
} from './documentationFinding';
import { isTestFile } from './testFiles';
import { DetectedPattern, PatternEvidence } from './patternDetectionTypes';

/**
 * A problem found in the changed files: severity, the files and evidence involved, and a concrete
 * hint on how to fix it.
 */
export interface ChangeFinding {
  id: string;
  severity: DetectedPattern['severity'];
  title: string;
  description: string;
  files: string[];
  evidence: PatternEvidence[];
  fix: string;
}

/**
 * Verdict of a validation. `scope` is 'changed' when it covers the given files and 'project' when
 * no files were given; `isValid` is false when blocking findings exist. In ratchet mode `findings`
 * holds only new or worsened problems and `legacyDebt` summarizes the old ones; `configWarnings`
 * lists problems found in the project's config file.
 */
export interface ChangeValidationResult {
  scope: 'changed' | 'project';
  changedFiles: string[];
  isValid: boolean;
  findings: ChangeFinding[];
  recommendation: string;
  legacyDebt?: LegacyDebtSummary;
  configWarnings?: string[];
}

const FIX_HINTS: Record<string, string> = {
  god_files:
    'Split the file by responsibility: move each cohesive group of symbols into its own module and keep this one as a thin entry point.',
  god_classes:
    'Extract collaborators from the class (single responsibility) and depend on them through interfaces.',
  oversized_modules:
    'Break the module into smaller files grouped by use case; avoid adding more code here.',
  long_methods: 'Extract named helper functions from the long method so each does one thing.',
  complex_methods:
    'Reduce branching: replace conditionals with lookup tables or polymorphism, and extract guard clauses.',
  code_clones:
    'This logic already exists elsewhere: reuse or extract the shared function instead of duplicating it.',
  mixed_responsibility_modules:
    'Separate orchestration, wiring and helper logic into different modules.',
  high_fan_out_files:
    'The file depends on too many modules: introduce a facade or split it so each part needs fewer dependencies.',
  hub_nodes:
    'Many modules depend on this symbol: keep its interface minimal and stable, and avoid widening it.',
};

const DEFAULT_FIX = 'Review and refactor the flagged code.';

// Churn only reflects history, so a file you just edited always looks "hot".
const IGNORED_PATTERNS = new Set(['churn_hotspots']);
const SIZE_PATTERNS = new Set([
  'god_files',
  'oversized_modules',
  'long_methods',
  'complex_methods',
  'mixed_responsibility_modules',
]);
const ADVISORY_PATTERNS = new Set(['hub_nodes']);
const MAX_PROJECT_FINDINGS = 10;
const MAX_EVIDENCE = 5;

/**
 * Whether a finding makes a validation fail: high severity, except for advisory patterns such as
 * hubs. Exported so other front ends (the headless CI guard) decide exactly like the MCP tool.
 */
export const isBlockingFinding = (finding: Pick<ChangeFinding, 'id' | 'severity'>): boolean =>
  finding.severity === 'high' && !ADVISORY_PATTERNS.has(finding.id);

/** Whether a finding is only information (a hub): nothing an edit to the file could fix. */
export const isAdvisoryFinding = (finding: Pick<ChangeFinding, 'id'>): boolean =>
  ADVISORY_PATTERNS.has(finding.id);

const normalize = (value: string) => value.replace(/\\/g, '/').toLowerCase();
const fileOf = (nodeId: string) => nodeId.split('#')[0];
/**
 * Converts a detected pattern into a finding, with a fix hint for its kind and at most 5 evidence
 * entries.
 */
const toFinding = (
  pattern: DetectedPattern,
  files: string[],
  evidence: PatternEvidence[]
): ChangeFinding => ({
  id: pattern.id,
  severity: pattern.severity,
  title: pattern.title,
  description: pattern.description,
  files,
  evidence: evidence.slice(0, MAX_EVIDENCE),
  fix: FIX_HINTS[pattern.id] ?? DEFAULT_FIX,
});

/**
 * Fallback when no changed files are known: reports the high-severity patterns of the whole
 * project (up to 10) and is valid only without them and with a health score above 60 (the score
 * is not consulted in ratchet mode).
 */
const validateWholeProject = (
  patterns: DetectedPattern[],
  healthScore: number,
  documentation: DocumentationReport | null,
  ratchetActive: boolean
): ChangeValidationResult => {
  const high = patterns.filter((pattern) => pattern.severity === 'high');
  // The health score counts the old debt a ratchet accepts, so it cannot veto a ratchet run.
  const isValid = high.length === 0 && (ratchetActive || healthScore > 60);
  return {
    scope: 'project',
    changedFiles: [],
    isValid,
    findings: high
      .slice(0, MAX_PROJECT_FINDINGS)
      .map((pattern) =>
        toFinding(
          pattern,
          Array.from(new Set(pattern.nodeIds.map(fileOf))).slice(0, MAX_PROJECT_FINDINGS),
          pattern.evidence ?? []
        )
      )
      .concat(documentationFindingForProject(documentation) ?? []),
    recommendation: isValid
      ? 'No changed files were detected and the project is healthy overall.'
      : 'No changed files were detected, so the whole project was checked. Pass changedFiles or baseRef to validate only your edits.',
  };
};

/**
 * Narrows project-wide pattern findings to the files an agent just changed, so a legacy
 * codebase does not block unrelated work and the answer stays short. With a `ratchet` only
 * findings that are new or worse than the baseline count and the old debt is summarized.
 */
export const validateChanges = (input: {
  patterns: DetectedPattern[];
  changedFiles: string[];
  healthScore: number;
  /** Documentation coverage of the project; leave out when it was not measured. */
  documentation?: DocumentationReport | null;
  /** The baseline classification of the project; leave out in strict mode or without a baseline. */
  ratchet?: RatchetContext | null;
}): ChangeValidationResult => {
  const { ratchet } = input;
  const patterns = ratchet ? applyRatchetToPatterns(input.patterns, ratchet) : input.patterns;
  const documentation = ratchet
    ? applyRatchetToDocumentation(input.documentation ?? null, ratchet)
    : (input.documentation ?? null);
  const result = judge({ ...input, patterns, documentation, ratchetActive: !!ratchet });
  return ratchet ? { ...result, legacyDebt: ratchet.legacyDebt } : result;
};

/** The verdict over already ratcheted (or untouched) patterns and documentation. */
const judge = (input: {
  patterns: DetectedPattern[];
  changedFiles: string[];
  healthScore: number;
  documentation: DocumentationReport | null;
  ratchetActive: boolean;
}): ChangeValidationResult => {
  const changed = new Set(input.changedFiles.map(normalize));

  if (changed.size === 0) {
    return validateWholeProject(
      input.patterns,
      input.healthScore,
      input.documentation,
      input.ratchetActive
    );
  }

  const findings = input.patterns
    .filter((pattern) => !IGNORED_PATTERNS.has(pattern.id))
    .flatMap((pattern) => findingsForChangedFiles(pattern, changed))
    .concat(documentationFindingForChanges(input.documentation, input.changedFiles) ?? []);

  // Who depends on a file is not something an edit to it can fix, so a hub never blocks.
  const blocking = findings.filter(isBlockingFinding);

  return {
    scope: 'changed',
    changedFiles: input.changedFiles,
    isValid: blocking.length === 0,
    findings,
    recommendation: describeChangeVerdict(blocking.length, findings.length),
  };
};

/**
 * Creates a finding for a pattern if it involves any changed file (test files excluded for size
 * patterns); evidence is cut to the changed files. Returns an empty list otherwise.
 */
const findingsForChangedFiles = (pattern: DetectedPattern, changed: Set<string>) => {
  const files = Array.from(
    new Set(
      pattern.nodeIds
        .map(fileOf)
        .filter((file) => changed.has(normalize(file)))
        .filter((file) => !(SIZE_PATTERNS.has(pattern.id) && isTestFile(file)))
    )
  );
  if (files.length === 0) return [];

  const evidence = (pattern.evidence ?? []).filter((item) =>
    changed.has(normalize(fileOf(item.nodeId)))
  );
  return [toFinding(pattern, files, evidence)];
};

const describeChangeVerdict = (blockingCount: number, findingCount: number) => {
  if (blockingCount > 0) {
    return `Fix ${blockingCount} high-severity problem(s) in the files you changed before finishing.`;
  }
  if (findingCount > 0) {
    return 'No blocking problems in your changes; consider the lower-severity findings.';
  }
  return 'Your changes introduce no flagged problems. Safe to proceed.';
};
