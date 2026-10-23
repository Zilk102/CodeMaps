import { isTestFile } from './testFiles';
import { DetectedPattern, PatternEvidence } from './patternDetectionTypes';

export interface ChangeFinding {
  id: string;
  severity: DetectedPattern['severity'];
  title: string;
  description: string;
  files: string[];
  evidence: PatternEvidence[];
  fix: string;
}

export interface ChangeValidationResult {
  scope: 'changed' | 'project';
  changedFiles: string[];
  isValid: boolean;
  findings: ChangeFinding[];
  recommendation: string;
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

const normalize = (value: string) => value.replace(/\\/g, '/').toLowerCase();
const fileOf = (nodeId: string) => nodeId.split('#')[0];
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

const validateWholeProject = (
  patterns: DetectedPattern[],
  healthScore: number
): ChangeValidationResult => {
  const high = patterns.filter((pattern) => pattern.severity === 'high');
  const isValid = high.length === 0 && healthScore > 60;
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
      ),
    recommendation: isValid
      ? 'No changed files were detected and the project is healthy overall.'
      : 'No changed files were detected, so the whole project was checked. Pass changedFiles or baseRef to validate only your edits.',
  };
};

/**
 * Narrows project-wide pattern findings to the files an agent just changed, so a legacy
 * codebase does not block unrelated work and the answer stays short.
 */
export const validateChanges = (input: {
  patterns: DetectedPattern[];
  changedFiles: string[];
  healthScore: number;
}): ChangeValidationResult => {
  const changed = new Set(input.changedFiles.map(normalize));

  if (changed.size === 0) {
    return validateWholeProject(input.patterns, input.healthScore);
  }

  const findings: ChangeFinding[] = [];
  for (const pattern of input.patterns) {
    if (IGNORED_PATTERNS.has(pattern.id)) continue;

    const files = Array.from(
      new Set(
        pattern.nodeIds
          .map(fileOf)
          .filter((file) => changed.has(normalize(file)))
          .filter((file) => !(SIZE_PATTERNS.has(pattern.id) && isTestFile(file)))
      )
    );
    if (files.length === 0) continue;

    const evidence = (pattern.evidence ?? []).filter((item) =>
      changed.has(normalize(fileOf(item.nodeId)))
    );
    findings.push(toFinding(pattern, files, evidence));
  }

  // Who depends on a file is not something an edit to it can fix, so a hub never blocks.
  const blocking = findings.filter(
    (finding) => finding.severity === 'high' && !ADVISORY_PATTERNS.has(finding.id)
  );
  const isValid = blocking.length === 0;
  let recommendation = 'Your changes introduce no flagged problems. Safe to proceed.';
  if (!isValid) {
    recommendation = `Fix ${blocking.length} high-severity problem(s) in the files you changed before finishing.`;
  } else if (findings.length > 0) {
    recommendation = 'No blocking problems in your changes; consider the lower-severity findings.';
  }

  return {
    scope: 'changed',
    changedFiles: input.changedFiles,
    isValid,
    findings,
    recommendation,
  };
};
