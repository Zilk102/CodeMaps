import { GraphNode } from '../store';
import type {
  ArchitectureNodeClassification,
  ArchitectureViolation,
} from './ArchitectureInsightService';
import type { BlastRadiusResult } from './BlastRadiusAnalyzer';
import type {
  ChangeContextResult,
  ChangeTaskMode,
  ResolvedTargetContext,
} from './ChangeContextService';
import type { DecompositionCandidate } from './DecompositionGuidanceService';
import type { DetectedPattern } from './PatternDetectionAnalyzer';
import { isChangeRiskPattern, isDesignSmellPattern } from './patternPolicies';
import type { SecurityFinding } from './SecurityScanner';

export function buildChangeAutopilotPlan(args: {
  taskMode: ChangeTaskMode;
  changeIntent?: string;
  resolvedTarget: ResolvedTargetContext;
  targetClassification: ArchitectureNodeClassification;
  blastRadius: BlastRadiusResult;
  runtimeContractLinks: ChangeContextResult['dependencies']['runtimeContractLinks'];
  contractBindingLinks: ChangeContextResult['dependencies']['contractBindingLinks'];
  securityFindings: SecurityFinding[];
}): ChangeContextResult['autopilotPlan'] {
  const targetKind = `${args.resolvedTarget.node.type}:${args.resolvedTarget.node.label}`;
  const preferredNextAction: ChangeContextResult['autopilotPlan']['preferredNextAction'] =
    args.securityFindings.length > 0
      ? 'check_security'
      : args.runtimeContractLinks.length > 0
        ? 'review_dependencies'
      : args.contractBindingLinks.length > 0
        ? 'review_dependencies'
      : args.blastRadius.affectedNodes.length > 0
        ? 'review_dependencies'
      : args.targetClassification.layer === 'shared' ||
          args.targetClassification.layer === 'domain'
        ? 'verify_architecture'
        : 'inspect_code';

  return {
    primaryGoal: args.changeIntent || describeChangeModeGoal(args.taskMode),
    whyThisTarget:
      args.resolvedTarget.resolutionReason === 'exact_id_match'
        ? `${targetKind} selected because it is an exact match.`
        : `${targetKind} selected due to ${args.resolvedTarget.resolutionReason}.`,
    preferredNextAction,
    shouldFallbackToLowLevelTools:
      args.resolvedTarget.alternatives.length > 0 && !args.resolvedTarget.exactMatch,
  };
}

export function buildChangeRisks(args: {
  target: GraphNode;
  targetClassification: ArchitectureNodeClassification;
  blastRadius: BlastRadiusResult;
  runtimeContractNodes: GraphNode[];
  contractBindingNodes: GraphNode[];
  targetViolations: ArchitectureViolation[];
  relevantPatterns: DetectedPattern[];
  securityFindings: SecurityFinding[];
}) {
  const risks: string[] = [];

  if (args.blastRadius.confidence === 'high' && args.blastRadius.affectedNodes.length > 0) {
    risks.push(
      `The change has a confirmed impact on ${args.blastRadius.affectedNodes.length} dependent nodes.`
    );
  }

  if (args.targetViolations.length > 0) {
    risks.push(
      'The target area is already involved in layer violations; a local fix may solidify the architectural smell.'
    );
  }

  if (
    args.relevantPatterns.some(
      (pattern) =>
        pattern.id === 'hub_nodes' ||
        pattern.id === 'high_fan_out_files' ||
        isChangeRiskPattern(pattern)
    )
  ) {
    risks.push(
      'The target lies near high-coupling hotspot nodes; caution is needed with new dependencies.'
    );
  }

  if (args.relevantPatterns.some(isDesignSmellPattern)) {
    risks.push(
      'The target sits in an oversized or responsibility-dense module; extending it may entrench SRP violations, long/complex methods, or god-object behavior and make future decomposition harder.'
    );
  }

  if (args.securityFindings.length > 0) {
    risks.push(
      'There are already security findings in adjacent files; the change must be verified against data and API security.'
    );
  }

  if (
    args.targetClassification.layer === 'shared' ||
    args.targetClassification.layer === 'domain'
  ) {
    risks.push(
      `The target is in the ${args.targetClassification.layer} layer, so the blast radius may extend far beyond the local module.`
    );
  }

  if (args.runtimeContractNodes.length > 0) {
    risks.push(
      'The target participates in runtime DI wiring; provider tokens, bean factories, or service registrations may expand impact beyond explicit imports.'
    );
  }

  if (args.contractBindingNodes.length > 0) {
    risks.push(
      'The target participates in API contract/runtime bindings; schema roots, generated clients, handlers, or servers may widen impact beyond direct imports.'
    );
  }

  if (risks.length === 0) {
    risks.push(
      'No obvious structural red flags found, but still verify runtime contracts and reverse dependencies.'
    );
  }

  return risks;
}

export function buildChangeNextSteps(args: {
  changeIntent?: string;
  target: GraphNode;
  targetClassification: ArchitectureNodeClassification;
  recommendedFilesToInspect: string[];
  blastRadius: BlastRadiusResult;
  runtimeContractNodes: GraphNode[];
  contractBindingNodes: GraphNode[];
  securityFindings: SecurityFinding[];
  decompositionCandidates: DecompositionCandidate[];
}) {
  const nextSteps = [
    `First, re-read the target node ${args.target.id} and the closest files from recommendedFilesToInspect.`,
    'Check if the change creates new layer violations or unnecessary import edges.',
  ];

  if (args.changeIntent) {
    nextSteps.unshift(`Clarify change intent: ${args.changeIntent}.`);
  }

  if (args.blastRadius.affectedNodes.length > 0) {
    nextSteps.push(
      'After editing, double-check the affected nodes from the blast radius and ensure contracts have not degraded.'
    );
  }

  if (args.runtimeContractNodes.length > 0) {
    nextSteps.push(
      'Inspect DI runtime contracts separately from imports and verify provider bindings, bean factories, or service registrations after the change.'
    );
  }

  if (args.contractBindingNodes.length > 0) {
    nextSteps.push(
      'Inspect API contract bindings separately from imports and verify schema roots, generated modules, and runtime handlers/clients after the change.'
    );
  }

  if (args.securityFindings.length > 0) {
    nextSteps.push(
      'Separately re-verify safe handling of secrets, shell/process APIs, and browser storage.'
    );
  }

  if (
    args.targetClassification.layer === 'application' ||
    args.targetClassification.layer === 'integration'
  ) {
    nextSteps.push(
      'Ensure that orchestration/integration code does not start pulling presentation details or extra state.'
    );
  }

  if (args.target.churn >= 10) {
    nextSteps.push(
      'If the target is already a churn-heavy orchestration file, prefer extracting responsibilities instead of adding another branch, matcher, or adapter path.'
    );
  }

  if (args.decompositionCandidates.length > 0) {
    nextSteps.push(
      `Use decompositionCandidates to choose the first extraction seam before editing; top candidate: ${args.decompositionCandidates[0].targetLabel}.`
    );
  }

  return nextSteps;
}

function describeChangeModeGoal(taskMode: ChangeTaskMode) {
  switch (taskMode) {
    case 'feature':
      return 'Find a safe integration point for new functionality.';
    case 'refactor':
      return 'Modify the structure without regressing dependencies and layers.';
    case 'explore':
      return 'Understand the scope of changes and gather minimally sufficient context.';
    case 'bugfix':
    default:
      return 'Find and fix the defect with minimal blast radius.';
  }
}
