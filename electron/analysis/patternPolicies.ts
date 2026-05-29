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

export const isDesignSmellPattern = (pattern: Pick<DetectedPattern, 'id'>) =>
  designSmellPatternIdSet.has(pattern.id);

export const isChangeRiskPattern = (pattern: Pick<DetectedPattern, 'id'>) =>
  changeRiskPatternIdSet.has(pattern.id);

export const collectPatternNodeIds = (patterns: DetectedPattern[], predicate: (pattern: DetectedPattern) => boolean) =>
  Array.from(new Set(patterns.filter(predicate).flatMap((pattern) => pattern.nodeIds)));
