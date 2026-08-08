import { GraphData } from '../store';
import type { ArchitectureOverview } from './ArchitectureInsightService';
import type { DecompositionGuidance } from './DecompositionGuidanceService';
import type { HealthScoreResult } from './HealthScoreAnalyzer';
import { collectPatternNodeIds, isDesignSmellPattern } from './patternPolicies';
import type { DetectedPattern } from './PatternDetectionAnalyzer';
import type { QualityBudget } from './QualityGovernanceService';
import type { ReviewContextResult, ReviewPriority, ReviewTaskMode } from './ReviewContextService';
import type { SecurityFinding } from './SecurityScanner';
import { isContractSemanticLink, isDiRuntimeLink, isStackAwareLink } from './graphAnalysisUtils';
import { toStructuralNodeId, unique } from './AgentContextUtils';

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
  const priorities: ReviewPriority[] = [];
  const stackAwareNodeIds = collectLinkedNodeIds(graph, isStackAwareLink);
  const diRuntimeNodeIds = collectLinkedNodeIds(graph, isDiRuntimeLink);
  const contractBindingNodeIds = collectStructuralLinkedNodeIds(graph, isContractSemanticLink);
  const designSmellPatterns = patterns.filter(isDesignSmellPattern);

  if (securityFindings.some((finding) => finding.severity === 'critical')) {
    priorities.push(
      createPriority({
        severity: 'critical',
        title: 'Security Findings',
        reason:
          'The project has critical security findings; they must be addressed before any architectural cosmetics.',
        nodeIds: securityFindings
          .filter((finding) => finding.severity === 'critical')
          .map((finding) => finding.nodeId),
      })
    );
  }

  if (architecture.violations.length > 0) {
    priorities.push(
      createPriority({
        severity: architecture.violations.length > 10 ? 'high' : 'medium',
        title: 'Architecture Violations',
        reason:
          'Layer dependency violations harm maintainability and make impact analysis less predictable.',
        nodeIds: architecture.violations
          .slice(0, 10)
          .flatMap((violation) => [violation.sourceId, violation.targetId]),
      })
    );
  }

  const severePatterns = patterns.filter((pattern) => pattern.severity === 'high');
  if (severePatterns.length > 0) {
    priorities.push(
      createPriority({
        severity: 'high',
        title: 'High-Severity Patterns',
        reason:
          'The graph contains hotspots and anti-pattern candidates that increase blast radius and churn risk.',
        nodeIds: severePatterns.flatMap((pattern) => pattern.nodeIds),
      })
    );
  }

  if (health.issues.length > 0) {
    priorities.push(
      createPriority({
        severity: health.grade === 'F' || health.grade === 'D' ? 'high' : 'medium',
        title: 'Health Issues',
        reason:
          'Health score already signals structural degradation: the review must explicitly cover these issues.',
        nodeIds: [],
      })
    );
  }

  const shouldReviewMaintainabilityBudget =
    health.summary.maintainabilityScore < 85 ||
    health.summary.solidScore < 85 ||
    qualityBudget.recommendedPolicy !== 'allow_targeted_changes' ||
    decompositionGuidance.summary.highPriorityCount > 0;

  if (shouldReviewMaintainabilityBudget) {
    priorities.push(
      createPriority({
        severity:
          health.summary.maintainabilityScore < 60 || health.summary.solidScore < 60
            ? 'high'
            : 'medium',
        title: 'Maintainability Budget',
        reason: `Maintainability=${health.summary.maintainabilityScore.toFixed(1)}, SOLID=${health.summary.solidScore.toFixed(1)}, policy=${qualityBudget.recommendedPolicy}. The review should treat design debt as a delivery risk, not cosmetic cleanup.`,
        nodeIds: collectPatternNodeIds(patterns, isDesignSmellPattern),
      })
    );
  }

  if (health.summary.stackAwareLinks > 0) {
    priorities.push(
      createPriority({
        severity: health.summary.stackAwareLinks >= 12 ? 'high' : 'medium',
        title: 'Stack-Aware Runtime Paths',
        reason:
          'Framework/build enrichment exposed runtime and assembly paths that should be reviewed together with direct imports.',
        nodeIds: stackAwareNodeIds,
      })
    );
  }

  if (health.summary.diRuntimeLinks > 0) {
    priorities.push(
      createPriority({
        severity: health.summary.diRuntimeLinks >= 8 ? 'high' : 'medium',
        title: 'DI Runtime Contracts',
        reason:
          'Provider bindings, bean factories, and service registrations define runtime wiring that may bypass plain import-based dependency intuition.',
        nodeIds: diRuntimeNodeIds,
      })
    );
  }

  if (health.summary.contractSemanticLinks > 0) {
    priorities.push(
      createPriority({
        severity: health.summary.contractSemanticLinks >= 10 ? 'high' : 'medium',
        title: 'Contract Runtime Bindings',
        reason:
          'OpenAPI/protobuf schemas, generated clients, and runtime handlers/servers are linked structurally, so contract changes should be reviewed beyond plain imports.',
        nodeIds: contractBindingNodeIds,
      })
    );
  }

  if (hasDesignSmellSignals(health)) {
    priorities.push(
      createPriority({
        severity:
          health.summary.godFiles > 0 || health.summary.godClasses > 0 ? 'high' : 'medium',
        title: 'Design Smells',
        reason:
          'Some modules/classes already show SRP/OOP smell signals, so the review should explicitly check extraction boundaries, class API size, and long-method decomposition opportunities.',
        nodeIds: designSmellPatterns.flatMap((pattern) => pattern.nodeIds),
        evidence: designSmellPatterns
          .flatMap((pattern) => pattern.evidence || [])
          .map((item) => item.message)
          .slice(0, 5),
      })
    );
  }

  if (decompositionGuidance.candidates.length > 0) {
    priorities.push(
      createPriority({
        severity: decompositionGuidance.summary.highPriorityCount > 0 ? 'high' : 'medium',
        title: 'Decomposition Candidates',
        reason:
          'Structured extraction candidates are available, so the review can evaluate concrete split points instead of discussing refactoring only at file level.',
        nodeIds: decompositionGuidance.candidates.map((candidate) => candidate.fileNodeId),
        evidence: decompositionGuidance.candidates
          .slice(0, 5)
          .map((candidate) => `${candidate.targetLabel}: ${candidate.reason}`),
      })
    );
  }

  if (
    health.summary.refreshPipelineDegraded ||
    health.summary.avgRefreshLatencyMs >= 20 ||
    health.summary.runtimePriorityRebuilds > 0
  ) {
    priorities.push(
      createPriority({
        severity:
          health.summary.avgRefreshLatencyMs >= 50 || health.summary.runtimePriorityRebuilds >= 3
            ? 'high'
            : 'medium',
        title: 'Incremental Refresh Pipeline',
        reason:
          'Watcher batching, skipped refreshes, and runtime-priority rebuilds indicate how stable and efficient incremental graph maintenance remains under real edit bursts.',
        nodeIds: focus?.matches.map((node) => node.id) || [],
      })
    );
  }

  if (focus && focus.matches.length > 0) {
    priorities.push(
      createPriority({
        severity: 'low',
        title: 'Focused Review Scope',
        reason: `There is an explicit focus query "${focus.query}", so it is worth double-checking local dependencies and the layer of the target area.`,
        nodeIds: focus.matches.map((node) => node.id),
      })
    );
  }

  return priorities.slice(0, 6);
}

export function buildReviewNextSteps(
  health: HealthScoreResult,
  architecture: ArchitectureOverview,
  patterns: DetectedPattern[],
  securityFindings: SecurityFinding[],
  hasFocus: boolean,
  decompositionGuidance: DecompositionGuidance
) {
  const nextSteps = [
    'Start the review with nodes that fell into top architecture violations and severe patterns.',
    'Check if high fan-in/high fan-out nodes hide excessive responsibility and incorrect module boundaries.',
  ];

  if (securityFindings.length > 0) {
    nextSteps.unshift('Address security findings first, especially critical and high severity ones.');
  }

  if (health.issues.length > 0) {
    nextSteps.push(
      'Cross-check health issues with the actual code and determine what is a real problem and what is heuristic noise.'
    );
  }

  if (health.summary.stackAwareLinks > 0) {
    nextSteps.push(
      'Review framework/build dependency paths separately from plain imports to verify entrypoints, routes, modules, and build descriptors.'
    );
  }

  if (health.summary.diRuntimeLinks > 0) {
    nextSteps.push(
      'Inspect DI runtime contracts separately from imports: verify provider tokens, bean factories, and service registrations against the actual concrete implementations.'
    );
  }

  if (health.summary.contractSemanticLinks > 0) {
    nextSteps.push(
      'Inspect API contract bindings separately from imports: verify schema roots, generated modules, and runtime handlers/clients against the actual operation/service symbols.'
    );
  }

  if (hasDesignSmellSignals(health)) {
    nextSteps.push(
      'Inspect design-smell hotspots separately: identify mixed responsibilities, god classes, long/complex methods, extraction boundaries, and files that should stop accumulating new stack-specific logic.'
    );
  }

  if (decompositionGuidance.candidates.length > 0) {
    nextSteps.push(
      'Use structured decomposition candidates to review the exact classes and methods that should be extracted first, not just the surrounding files.'
    );
  }

  if (
    health.summary.refreshPipelineDegraded ||
    health.summary.avgRefreshLatencyMs >= 20 ||
    health.summary.runtimePriorityRebuilds > 0
  ) {
    nextSteps.push(
      'Inspect incremental refresh telemetry separately: verify watcher batching, runtime-priority rebuild paths, refresh latency, and whether operational pressure matches the reported degradation.'
    );
  }

  if (architecture.summary.unknownNodes > 0) {
    nextSteps.push(
      'Refine layer classification rules for unknown nodes so the agent and review rely on a more accurate model.'
    );
  }

  if (patterns.length === 0) {
    nextSteps.push(
      'No obvious structural patterns found; the review should focus on code contracts and runtime behavior.'
    );
  }

  if (hasFocus) {
    nextSteps.push(
      'After a general overview, do a separate local review for the focus area and check its blast radius manually.'
    );
  }

  return nextSteps;
}

export function buildReviewAutopilotPlan(
  taskMode: ReviewTaskMode,
  securityFindings: SecurityFinding[],
  architecture: ArchitectureOverview,
  focus: ReviewContextResult['focus'],
  hasStackAwareLinks?: boolean,
  hasOperationalRefreshSignals?: boolean
) {
  const preferredOrder: Array<
    'security' | 'architecture' | 'patterns' | 'health' | 'focused_area'
  > = [];

  if (taskMode === 'security' || securityFindings.length > 0) {
    preferredOrder.push('security');
  }
  if (taskMode === 'architecture' || architecture.violations.length > 0) {
    preferredOrder.push('architecture');
  }
  if (hasStackAwareLinks) {
    preferredOrder.push('patterns');
  }
  if (hasOperationalRefreshSignals) {
    preferredOrder.push('health');
  }
  preferredOrder.push('patterns', 'health');
  if (focus?.matches.length) {
    preferredOrder.push('focused_area');
  }

  return {
    primaryGoal: describeReviewModeGoal(taskMode),
    preferredOrder: unique(preferredOrder),
    shouldFallbackToLowLevelTools: Boolean(
      focus?.matches.length && !focus.relatedPatterns.length && !focus.relatedViolations.length
    ),
  };
}

function createPriority(input: ReviewPriority): ReviewPriority {
  return {
    ...input,
    nodeIds: unique(input.nodeIds).slice(0, 10),
  };
}

function hasDesignSmellSignals(health: HealthScoreResult) {
  return (
    health.summary.oversizedModules > 0 ||
    health.summary.godFiles > 0 ||
    health.summary.godClasses > 0 ||
    health.summary.longMethods > 0 ||
    health.summary.complexMethods > 0 ||
    health.summary.mixedResponsibilityModules > 0
  );
}

function collectLinkedNodeIds(
  graph: GraphData,
  predicate: (link: GraphData['links'][number]) => boolean
) {
  return unique(
    graph.nodes
      .filter((node) =>
        graph.links.some((link) => predicate(link) && (link.source === node.id || link.target === node.id))
      )
      .map((node) => node.id)
  ).slice(0, 10);
}

function collectStructuralLinkedNodeIds(
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
      .filter((node) => structuralIds.includes(node.id) || structuralIds.includes(toStructuralNodeId(node.id)))
      .map((node) => node.id)
  ).slice(0, 10);
}

function describeReviewModeGoal(taskMode: ReviewTaskMode) {
  switch (taskMode) {
    case 'architecture':
      return 'Check architectural boundaries, layers, and module responsibilities.';
    case 'security':
      return 'Find and prioritize security risks and unsafe patterns.';
    case 'stabilization':
      return 'Identify points of structural instability and maintainability degradation.';
    case 'review':
    default:
      return 'Gather architectural and qualitative context for a meaningful review.';
  }
}
