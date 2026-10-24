/**
 * The limits the structure analysis applies to a function, derived from the project config.
 *
 * Without a config the limits are CodeMaps' built-in ones (long from 70 lines, complex from
 * complexity 10, deep from nesting 4; high severity from 120 lines, complexity 15, nesting 5).
 * A threshold the project wrote itself replaces the matching limit, and everything beyond it then
 * has high severity, because the project asked for exactly that rule.
 */
import type { ProjectConfig } from './types';

/** Inclusive minimums: a function with at least this much is reported. */
export interface StructureLimits {
  longMinLines: number;
  complexMinComplexity: number;
  deepMinNesting: number;
  /** From this many lines a long function is high severity. */
  severeLines: number;
  severeComplexity: number;
  severeNesting: number;
}

export const DEFAULT_STRUCTURE_LIMITS: StructureLimits = {
  longMinLines: 70,
  complexMinComplexity: 10,
  deepMinNesting: 4,
  severeLines: 120,
  severeComplexity: 15,
  severeNesting: 5,
};

/** The limits for a project: a threshold written in its config replaces the built-in value. */
export const structureLimitsOf = (config: ProjectConfig | undefined): StructureLimits => {
  const explicit = config?.explicitThresholds ?? {};
  const limits = { ...DEFAULT_STRUCTURE_LIMITS };
  if (explicit.maxFunctionLines !== undefined) {
    limits.longMinLines = explicit.maxFunctionLines + 1;
    limits.severeLines = limits.longMinLines;
  }
  if (explicit.maxComplexity !== undefined) {
    limits.complexMinComplexity = explicit.maxComplexity + 1;
    limits.severeComplexity = limits.complexMinComplexity;
  }
  if (explicit.maxNesting !== undefined) {
    limits.deepMinNesting = explicit.maxNesting + 1;
    limits.severeNesting = limits.deepMinNesting;
  }
  return limits;
};
