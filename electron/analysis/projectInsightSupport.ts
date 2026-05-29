import type { ArchitectureOverview } from './ArchitectureInsightService';
import type { ProjectInsightResult } from './ProjectInsightService';
import type { SecurityFinding } from './SecurityScanner';

const DEFAULT_PATTERN_LIMIT = 10;
const DEFAULT_FINDING_LIMIT = 10;

export function resolveProjectInsightLimit(limit?: number) {
  return limit || DEFAULT_PATTERN_LIMIT;
}

export function buildProjectArchitectureView(
  architecture: ArchitectureOverview,
  includeClassifications: boolean | undefined,
  limit: number
): ProjectInsightResult['architecture'] {
  return {
    summary: architecture.summary,
    layers: architecture.layers,
    dependencies: architecture.dependencies.slice(0, limit),
    classifications: includeClassifications ? architecture.classifications : undefined,
  };
}

export function buildProjectSecurityView(
  findings: SecurityFinding[],
  summary: ProjectInsightResult['security']['summary']
): ProjectInsightResult['security'] {
  return {
    summary,
    findings: findings.slice(0, DEFAULT_FINDING_LIMIT),
  };
}
