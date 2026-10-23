import type { GraphNode } from '../store/types';
import type { ArchitectureViolation } from './ArchitectureInsightService';
import type { DetectedPattern } from './PatternDetectionAnalyzer';
import type { SecurityFinding } from './SecurityScanner';
import { toStructuralNodeId } from './AgentContextUtils';

export type { CampaignBreadth, ChangeCampaignWave } from './changeCampaignPlan';
export {
  buildChangeCampaignNextSteps,
  buildChangeCampaignRisks,
  buildExecutionWaves,
  buildLayersInvolved,
  getCampaignBreadth,
} from './changeCampaignPlan';
export type { ChangeCampaignBlastRadiusView } from './changeCampaignScope';
export {
  buildChangeCampaignBlastRadius,
  collectMatchedFiles,
  collectRuntimeCompositionRoots,
  expandAffectedFiles,
} from './changeCampaignScope';
export { getCampaignNodeTypePriority, scoreCampaignNodeMatch } from './changeCampaignScoring';

const MAX_PATTERN_RESULTS = 10;
const MAX_SECURITY_FINDINGS = 12;

export interface ChangeCampaignSecurityView {
  summary: {
    total: number;
    critical: number;
    high: number;
    medium: number;
    low: number;
  };
  findings: SecurityFinding[];
}

export function collectStructuralNodeIds(nodes: GraphNode[]) {
  return new Set(nodes.map((node) => toStructuralNodeId(node.id)));
}

export function collectCampaignPatterns(
  patterns: DetectedPattern[],
  campaignStructuralIds: Set<string>
) {
  return patterns
    .filter((pattern) =>
      pattern.nodeIds.some((nodeId) => campaignStructuralIds.has(toStructuralNodeId(nodeId)))
    )
    .slice(0, MAX_PATTERN_RESULTS);
}

export function collectCampaignSecurityFindings(
  findings: SecurityFinding[],
  campaignStructuralIds: Set<string>
) {
  return findings
    .filter((finding) => campaignStructuralIds.has(toStructuralNodeId(finding.nodeId)))
    .slice(0, MAX_SECURITY_FINDINGS);
}

export function collectCampaignViolations(
  violations: ArchitectureViolation[],
  campaignStructuralIds: Set<string>
) {
  return violations.filter(
    (violation) =>
      campaignStructuralIds.has(toStructuralNodeId(violation.sourceId)) ||
      campaignStructuralIds.has(toStructuralNodeId(violation.targetId))
  );
}

export function buildCampaignSecurityView(findings: SecurityFinding[]): ChangeCampaignSecurityView {
  return {
    summary: {
      total: findings.length,
      critical: findings.filter((finding) => finding.severity === 'critical').length,
      high: findings.filter((finding) => finding.severity === 'high').length,
      medium: findings.filter((finding) => finding.severity === 'medium').length,
      low: findings.filter((finding) => finding.severity === 'low').length,
    },
    findings,
  };
}
