/**
 * Groups pattern ids into categories (design smells, change risks, hotspots) used when judging how
 * risky a change is.
 */

import { DetectedPattern } from './PatternDetectionAnalyzer';

export const DESIGN_SMELL_PATTERN_IDS = [
  'oversized_modules',
  'god_files',
  'god_classes',
  'long_methods',
  'complex_methods',
  'mixed_responsibility_modules',
] as const;

export const CHANGE_RISK_PATTERN_IDS = [
  ...DESIGN_SMELL_PATTERN_IDS,
  'di_runtime_contract_hubs',
  'contract_runtime_binding_hubs',
] as const;

const createIdSet = <T extends readonly string[]>(items: T) => new Set<string>(items);

const designSmellPatternIdSet = createIdSet(DESIGN_SMELL_PATTERN_IDS);
const changeRiskPatternIdSet = createIdSet(CHANGE_RISK_PATTERN_IDS);

/**
 * Whether the pattern is a design smell about code size or responsibilities, such as a god file or
 * a long method.
 */
export const isDesignSmellPattern = (pattern: Pick<DetectedPattern, 'id'>) =>
  designSmellPatternIdSet.has(pattern.id);

/** Whether a change near the pattern is risky: design smells plus DI and API contract hubs. */
export const isChangeRiskPattern = (pattern: Pick<DetectedPattern, 'id'>) =>
  changeRiskPatternIdSet.has(pattern.id);

/** Coupling hotspots plus every change-risk pattern: a change near them has a wider reach. */
export const isHotspotChangeRiskPattern = (pattern: Pick<DetectedPattern, 'id'>) =>
  pattern.id === 'hub_nodes' || pattern.id === 'high_fan_out_files' || isChangeRiskPattern(pattern);

/** Collects the unique node ids of the patterns that satisfy the predicate. */
export const collectPatternNodeIds = (
  patterns: DetectedPattern[],
  predicate: (pattern: DetectedPattern) => boolean
) => Array.from(new Set(patterns.filter(predicate).flatMap((pattern) => pattern.nodeIds)));
