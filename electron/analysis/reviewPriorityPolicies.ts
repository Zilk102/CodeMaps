import { GraphData } from '../store/types';
import type { ArchitectureOverview } from './ArchitectureInsightService';
import type { DecompositionGuidance } from './DecompositionGuidanceService';
import type { HealthScoreResult } from './HealthScoreAnalyzer';
import { collectPatternNodeIds, isDesignSmellPattern } from './patternPolicies';
import type { DetectedPattern } from './PatternDetectionAnalyzer';
import type { QualityBudget } from './QualityGovernanceService';
import type { ReviewContextResult, ReviewPriority } from './ReviewContextService';
import type { SecurityFinding } from './SecurityScanner';
import {
  contractBindingPriority,
  diRuntimePriority,
  stackAwarePriority,
} from './reviewLinkPriorities';
import {
  createPriority,
  hasDesignSmellSignals,
  hasRefreshPressure,
  priorityFrom,
  type PriorityBuilder,
  type ReviewPriorityContext,
} from './reviewPriorityShared';

function securityPriority({ securityFindings }: ReviewPriorityContext): ReviewPriority | null {
  const critical = securityFindings.filter((finding) => finding.severity === 'critical');
  if (critical.length === 0) return null;
  return createPriority({
    severity: 'critical',
    title: 'Security Findings',
    reason:
      'The project has critical security findings; they must be addressed before any architectural cosmetics.',
    nodeIds: critical.map((finding) => finding.nodeId),
  });
}

function architecturePriority({ architecture }: ReviewPriorityContext): ReviewPriority | null {
  if (architecture.violations.length === 0) return null;
  return createPriority({
    severity: architecture.violations.length > 10 ? 'high' : 'medium',
    title: 'Architecture Violations',
    reason:
      'Layer dependency violations harm maintainability and make impact analysis less predictable.',
    nodeIds: architecture.violations
      .slice(0, 10)
      .flatMap((violation) => [violation.sourceId, violation.targetId]),
  });
}

const severePatternsPriority: PriorityBuilder = ({ patterns }) =>
  priorityFrom(
    patterns.filter((pattern) => pattern.severity === 'high'),
    (severe) => ({
      severity: 'high',
      title: 'High-Severity Patterns',
      reason:
        'The graph contains hotspots and anti-pattern candidates that increase blast radius and churn risk.',
      nodeIds: severe.flatMap((pattern) => pattern.nodeIds),
    })
  );

const healthIssuesPriority: PriorityBuilder = ({ health }) =>
  priorityFrom(health.issues, () => ({
    severity: health.grade === 'F' || health.grade === 'D' ? 'high' : 'medium',
    title: 'Health Issues',
    reason:
      'Health score already signals structural degradation: the review must explicitly cover these issues.',
    nodeIds: [],
  }));

function maintainabilityBudgetPriority({
  health,
  patterns,
  qualityBudget,
  decompositionGuidance,
}: ReviewPriorityContext): ReviewPriority | null {
  const shouldReview =
    health.summary.maintainabilityScore < 85 ||
    health.summary.solidScore < 85 ||
    qualityBudget.recommendedPolicy !== 'allow_targeted_changes' ||
    decompositionGuidance.summary.highPriorityCount > 0;
  if (!shouldReview) return null;
  return createPriority({
    severity:
      health.summary.maintainabilityScore < 60 || health.summary.solidScore < 60
        ? 'high'
        : 'medium',
    title: 'Maintainability Budget',
    reason: `Maintainability=${health.summary.maintainabilityScore.toFixed(1)}, SOLID=${health.summary.solidScore.toFixed(1)}, policy=${qualityBudget.recommendedPolicy}. The review should treat design debt as a delivery risk, not cosmetic cleanup.`,
    nodeIds: collectPatternNodeIds(patterns, isDesignSmellPattern),
  });
}

function designSmellsPriority({ health, patterns }: ReviewPriorityContext): ReviewPriority | null {
  if (!hasDesignSmellSignals(health)) return null;
  const designSmellPatterns = patterns.filter(isDesignSmellPattern);
  return createPriority({
    severity: health.summary.godFiles > 0 || health.summary.godClasses > 0 ? 'high' : 'medium',
    title: 'Design Smells',
    reason:
      'Some modules/classes already show SRP/OOP smell signals, so the review should explicitly check extraction boundaries, class API size, and long-method decomposition opportunities.',
    nodeIds: designSmellPatterns.flatMap((pattern) => pattern.nodeIds),
    evidence: designSmellPatterns
      .flatMap((pattern) => pattern.evidence || [])
      .map((item) => item.message)
      .slice(0, 5),
  });
}

function decompositionPriority({
  decompositionGuidance,
}: ReviewPriorityContext): ReviewPriority | null {
  if (decompositionGuidance.candidates.length === 0) return null;
  return createPriority({
    severity: decompositionGuidance.summary.highPriorityCount > 0 ? 'high' : 'medium',
    title: 'Decomposition Candidates',
    reason:
      'Structured extraction candidates are available, so the review can evaluate concrete split points instead of discussing refactoring only at file level.',
    nodeIds: decompositionGuidance.candidates.map((candidate) => candidate.fileNodeId),
    evidence: decompositionGuidance.candidates
      .slice(0, 5)
      .map((candidate) => `${candidate.targetLabel}: ${candidate.reason}`),
  });
}

function refreshPipelinePriority({ health, focus }: ReviewPriorityContext): ReviewPriority | null {
  if (!hasRefreshPressure(health)) return null;
  return createPriority({
    severity:
      health.summary.avgRefreshLatencyMs >= 50 || health.summary.runtimePriorityRebuilds >= 3
        ? 'high'
        : 'medium',
    title: 'Incremental Refresh Pipeline',
    reason:
      'Watcher batching, skipped refreshes, and runtime-priority rebuilds indicate how stable and efficient incremental graph maintenance remains under real edit bursts.',
    nodeIds: focus?.matches.map((node) => node.id) || [],
  });
}

function focusedScopePriority({ focus }: ReviewPriorityContext): ReviewPriority | null {
  if (!focus || focus.matches.length === 0) return null;
  return createPriority({
    severity: 'low',
    title: 'Focused Review Scope',
    reason: `There is an explicit focus query "${focus.query}", so it is worth double-checking local dependencies and the layer of the target area.`,
    nodeIds: focus.matches.map((node) => node.id),
  });
}

const PRIORITY_BUILDERS: PriorityBuilder[] = [
  securityPriority,
  architecturePriority,
  severePatternsPriority,
  healthIssuesPriority,
  maintainabilityBudgetPriority,
  stackAwarePriority,
  diRuntimePriority,
  contractBindingPriority,
  designSmellsPriority,
  decompositionPriority,
  refreshPipelinePriority,
  focusedScopePriority,
];

export function buildReviewPriorities(
  graph: GraphData,
  health: HealthScoreResult,
  architecture: ArchitectureOverview,
  patterns: DetectedPattern[],
  securityFindings: SecurityFinding[],
  focus: ReviewContextResult['focus'],
  decompositionGuidance: DecompositionGuidance,
  qualityBudget: QualityBudget
): ReviewPriority[] {
  const ctx: ReviewPriorityContext = {
    graph,
    health,
    architecture,
    patterns,
    securityFindings,
    focus,
    decompositionGuidance,
    qualityBudget,
  };
  return PRIORITY_BUILDERS.map((build) => build(ctx))
    .filter((priority): priority is ReviewPriority => priority !== null)
    .slice(0, 6);
}
