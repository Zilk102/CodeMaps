/**
 * Building blocks for the risk lists of change and campaign contexts: small rules that each yield
 * a message or nothing.
 */

import type { DetectedPattern } from './PatternDetectionAnalyzer';
import { isDesignSmellPattern, isHotspotChangeRiskPattern } from './patternPolicies';

/** A rule yields a risk message, or null when it does not apply to the input. */
export type RiskRule<Input> = (input: Input) => string | null;

/** A rule that reports `message` (fixed, or built from the input) when `applies` holds. */
export const riskWhen =
  <Input>(applies: (input: Input) => boolean, message: string | ((input: Input) => string)) =>
  (input: Input): string | null => {
    if (!applies(input)) return null;
    return typeof message === 'function' ? message(input) : message;
  };

/** Messages of every rule that applies, in rule order; `fallback` when none does. */
export const evaluateRiskRules = <Input>(
  rules: Array<RiskRule<Input>>,
  input: Input,
  fallback: string
): string[] => {
  const risks = rules.map((rule) => rule(input)).filter((risk): risk is string => risk !== null);
  return risks.length > 0 ? risks : [fallback];
};

/** What the layer-violation and pattern rules read from a rule input. */
export interface StructuralRiskEvidence {
  violations: unknown[];
  patterns: Array<Pick<DetectedPattern, 'id'>>;
}

/**
 * The three rules every change flow shares, in order: layer violations, coupling hotspots and
 * design smells. Each flow supplies where its input keeps that evidence and its own wording.
 */
export const structuralRiskRules = <Input>(
  evidenceOf: (input: Input) => StructuralRiskEvidence,
  messages: { violations: string; hotspots: string; designSmells: string }
): Array<RiskRule<Input>> => [
  riskWhen((input) => evidenceOf(input).violations.length > 0, messages.violations),
  riskWhen(
    (input) => evidenceOf(input).patterns.some(isHotspotChangeRiskPattern),
    messages.hotspots
  ),
  riskWhen((input) => evidenceOf(input).patterns.some(isDesignSmellPattern), messages.designSmells),
];
