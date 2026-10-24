/**
 * Public facade of the change campaign helpers plus the filters that restrict analysis results to
 * the campaign's files.
 */
import type { GraphNode } from '../store/types';
import type { ArchitectureViolation } from './ArchitectureInsightService';
import type { DetectedPattern } from './PatternDetectionAnalyzer';
import type { SecurityFinding } from './SecurityScanner';
import { toStructuralNodeId } from './AgentContextUtils';
import { summarizeSecurityFindings } from './securityFindingSummary';

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

/** Security findings in the campaign scope with a count of findings by severity. */
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

/**
 * Reduces nodes to the set of file-level ids they belong to, so symbol-level ids can be compared
 * with file-level results.
 */
export function collectStructuralNodeIds(nodes: GraphNode[]) {
  return new Set(nodes.map((node) => toStructuralNodeId(node.id)));
}

/** Keeps the detected patterns that involve at least one campaign file, limited to the first 10. */
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

/** Keeps the security findings located in campaign files, limited to the first 12. */
export function collectCampaignSecurityFindings(
  findings: SecurityFinding[],
  campaignStructuralIds: Set<string>
) {
  return findings
    .filter((finding) => campaignStructuralIds.has(toStructuralNodeId(finding.nodeId)))
    .slice(0, MAX_SECURITY_FINDINGS);
}

/** Keeps the architecture violations whose source or target is a campaign file. */
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

/** Wraps the campaign's security findings together with the summary counts per severity. */
export function buildCampaignSecurityView(findings: SecurityFinding[]): ChangeCampaignSecurityView {
  return {
    summary: summarizeSecurityFindings(findings),
    findings,
  };
}
