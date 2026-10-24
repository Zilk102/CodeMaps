/** Small helpers that shape the architecture and security parts of the project overview. */

import type { ArchitectureOverview } from './ArchitectureInsightService';
import type { ProjectInsightResult } from './projectInsightTypes';
import type { SecurityFinding } from './SecurityScanner';

const DEFAULT_PATTERN_LIMIT = 10;
const DEFAULT_FINDING_LIMIT = 10;

/** Number of items to keep in the overview lists; 10 when no limit is given. */
export function resolveProjectInsightLimit(limit?: number) {
  return limit || DEFAULT_PATTERN_LIMIT;
}

/**
 * Architecture part of the overview: summary and layers, the first `limit` layer dependencies, and
 * the per-node classifications only on request.
 */
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

/** Security part of the overview: the summary counts and the first 10 findings. */
export function buildProjectSecurityView(
  findings: SecurityFinding[],
  summary: ProjectInsightResult['security']['summary']
): ProjectInsightResult['security'] {
  return {
    summary,
    findings: findings.slice(0, DEFAULT_FINDING_LIMIT),
  };
}
