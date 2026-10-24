/** Small helpers for assembling detected patterns from detector findings. */

import type { DetectedPattern, PatternEvidence } from './patternDetectionTypes';

/**
 * Runs every builder on the same input and returns the patterns of those that found something
 * (non-null results).
 */
export function runBuilders<T>(builders: Array<(input: T) => DetectedPattern | null>, input: T) {
  return builders
    .map((build) => build(input))
    .filter((pattern): pattern is DetectedPattern => pattern !== null);
}

/**
 * Description of a pattern a detector can report: fixed id, title and text, plus functions that
 * compute severity, affected node ids and optional evidence from the findings.
 */
export interface PatternSpec<T> {
  id: string;
  title: string;
  description: string;
  severity: (findings: T[]) => DetectedPattern['severity'];
  nodeIds: (findings: T[]) => string[];
  evidence?: (findings: T[]) => PatternEvidence[];
}

/** A severity rule: 'high' when any finding matches, otherwise 'medium'. */
export function highWhenAny<T>(isHigh: (finding: T) => boolean) {
  return (findings: T[]): DetectedPattern['severity'] =>
    findings.some(isHigh) ? 'high' : 'medium';
}

/** Turns the findings of one detector into a pattern, or null when there are fewer than `minCount`. */
export function buildPattern<T>(
  findings: T[],
  spec: PatternSpec<T>,
  minCount = 1
): DetectedPattern | null {
  if (findings.length < minCount) return null;
  const pattern: DetectedPattern = {
    id: spec.id,
    severity: spec.severity(findings),
    title: spec.title,
    description: spec.description,
    nodeIds: spec.nodeIds(findings),
  };
  if (spec.evidence) pattern.evidence = spec.evidence(findings);
  return pattern;
}
