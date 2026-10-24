import { GraphData } from '../store/types';
import type { ArchitectureOverview } from './ArchitectureInsightService';
import type { DecompositionGuidance } from './DecompositionGuidanceService';
import type { HealthScoreResult } from './HealthScoreAnalyzer';
import type { DetectedPattern } from './PatternDetectionAnalyzer';
import type { QualityBudget } from './QualityGovernanceService';
import type { ReviewContextResult, ReviewPriority } from './ReviewContextService';
import type { SecurityFinding } from './SecurityScanner';
import { toStructuralNodeId, unique } from './AgentContextUtils';

export interface ReviewPriorityContext {
  graph: GraphData;
  health: HealthScoreResult;
  architecture: ArchitectureOverview;
  patterns: DetectedPattern[];
  securityFindings: SecurityFinding[];
  focus: ReviewContextResult['focus'];
  decompositionGuidance: DecompositionGuidance;
  qualityBudget: QualityBudget;
}

export type PriorityBuilder = (ctx: ReviewPriorityContext) => ReviewPriority | null;

export function createPriority(input: ReviewPriority): ReviewPriority {
  return {
    ...input,
    nodeIds: unique(input.nodeIds).slice(0, 10),
  };
}

/** A priority built from the findings of one kind, or null when there are none. */
export function priorityFrom<T>(
  findings: T[],
  make: (found: T[]) => ReviewPriority
): ReviewPriority | null {
  return findings.length === 0 ? null : createPriority(make(findings));
}

export function hasRefreshPressure(health: HealthScoreResult) {
  return (
    health.summary.refreshPipelineDegraded ||
    health.summary.avgRefreshLatencyMs >= 20 ||
    health.summary.runtimePriorityRebuilds > 0
  );
}

export function hasDesignSmellSignals(health: HealthScoreResult) {
  return (
    health.summary.oversizedModules > 0 ||
    health.summary.godFiles > 0 ||
    health.summary.godClasses > 0 ||
    health.summary.longMethods > 0 ||
    health.summary.complexMethods > 0 ||
    health.summary.mixedResponsibilityModules > 0
  );
}

export function collectLinkedNodeIds(
  graph: GraphData,
  predicate: (link: GraphData['links'][number]) => boolean
) {
  return unique(
    graph.nodes
      .filter((node) =>
        graph.links.some(
          (link) => predicate(link) && (link.source === node.id || link.target === node.id)
        )
      )
      .map((node) => node.id)
  ).slice(0, 10);
}

export function collectStructuralLinkedNodeIds(
  graph: GraphData,
  predicate: (link: GraphData['links'][number]) => boolean
) {
  const structuralIds = unique(
    graph.links
      .filter((link) => predicate(link))
      .flatMap((link) => [toStructuralNodeId(link.source), toStructuralNodeId(link.target)])
  );

  return unique(
    graph.nodes
      .filter(
        (node) =>
          structuralIds.includes(node.id) || structuralIds.includes(toStructuralNodeId(node.id))
      )
      .map((node) => node.id)
  ).slice(0, 10);
}
