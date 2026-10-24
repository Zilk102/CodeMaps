/**
 * Sorts current findings against a baseline.
 *
 * The baseline is a promise that old debt may stay but not grow: a finding that is not in it is
 * new, and a baselined one whose measure got larger (a longer function, a bigger clone) counts as
 * new again, because the debt grew.
 */
import type { Baseline, Classification, CurrentFinding } from './types';

/**
 * Splits `findings` into fresh, worsened and legacy. Without a baseline every finding is fresh.
 * The input order is kept inside each group.
 */
export const classifyFindings = (
  findings: CurrentFinding[],
  baseline: Baseline | null
): Classification => {
  const result: Classification = { fresh: [], legacy: [], worsened: [] };
  for (const finding of findings) {
    const recorded = baseline?.entries[finding.fingerprint];
    if (recorded === undefined) result.fresh.push(finding);
    else if (finding.measure > recorded) result.worsened.push(finding);
    else result.legacy.push(finding);
  }
  return result;
};

/** The findings that should be reported when a baseline is in force: fresh plus worsened. */
export const reportable = (classification: Classification): CurrentFinding[] => [
  ...classification.fresh,
  ...classification.worsened,
];
