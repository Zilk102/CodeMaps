import { GraphNode } from '../store/types';
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
import { evaluateRiskRules, riskWhen, structuralRiskRules, type RiskRule } from './riskRules';
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

type ChangeRiskArgs = {
  target: GraphNode;
  targetClassification: ArchitectureNodeClassification;
  blastRadius: BlastRadiusResult;
  runtimeContractNodes: GraphNode[];
  contractBindingNodes: GraphNode[];
  targetViolations: ArchitectureViolation[];
  relevantPatterns: DetectedPattern[];
  securityFindings: SecurityFinding[];
};

const isWideImpactLayer = (layer: string) => layer === 'shared' || layer === 'domain';

/** Applied in order; each rule yields a risk message, or null when it does not apply. */
const CHANGE_RISK_RULES: Array<RiskRule<ChangeRiskArgs>> = [
  riskWhen(
    (a) => a.blastRadius.confidence === 'high' && a.blastRadius.affectedNodes.length > 0,
    (a) =>
      `The change has a confirmed impact on ${a.blastRadius.affectedNodes.length} dependent nodes.`
  ),
  ...structuralRiskRules<ChangeRiskArgs>(
    (a) => ({ violations: a.targetViolations, patterns: a.relevantPatterns }),
    {
      violations:
        'The target area is already involved in layer violations; a local fix may solidify the architectural smell.',
      hotspots:
        'The target lies near high-coupling hotspot nodes; caution is needed with new dependencies.',
      designSmells:
        'The target sits in an oversized or responsibility-dense module; extending it may entrench SRP violations, long/complex methods, or god-object behavior and make future decomposition harder.',
    }
  ),
  riskWhen(
    (a) => a.securityFindings.length > 0,
    'There are already security findings in adjacent files; the change must be verified against data and API security.'
  ),
  riskWhen(
    (a) => isWideImpactLayer(a.targetClassification.layer),
    (a) =>
      `The target is in the ${a.targetClassification.layer} layer, so the blast radius may extend far beyond the local module.`
  ),
  riskWhen(
    (a) => a.runtimeContractNodes.length > 0,
    'The target participates in runtime DI wiring; provider tokens, bean factories, or service registrations may expand impact beyond explicit imports.'
  ),
  riskWhen(
    (a) => a.contractBindingNodes.length > 0,
    'The target participates in API contract/runtime bindings; schema roots, generated clients, handlers, or servers may widen impact beyond direct imports.'
  ),
];

export function buildChangeRisks(args: ChangeRiskArgs) {
  return evaluateRiskRules(
    CHANGE_RISK_RULES,
    args,
    'No obvious structural red flags found, but still verify runtime contracts and reverse dependencies.'
  );
}

interface ChangeNextStepsArgs {
  changeIntent?: string;
  target: GraphNode;
  targetClassification: ArchitectureNodeClassification;
  recommendedFilesToInspect: string[];
  blastRadius: BlastRadiusResult;
  runtimeContractNodes: GraphNode[];
  contractBindingNodes: GraphNode[];
  securityFindings: SecurityFinding[];
  decompositionCandidates: DecompositionCandidate[];
}

/** Conditional follow-ups, in the order they are appended after the two fixed steps. */
const CONDITIONAL_NEXT_STEPS: Array<[(args: ChangeNextStepsArgs) => boolean, string]> = [
  [
    (a) => a.blastRadius.affectedNodes.length > 0,
    'After editing, double-check the affected nodes from the blast radius and ensure contracts have not degraded.',
  ],
  [
    (a) => a.runtimeContractNodes.length > 0,
    'Inspect DI runtime contracts separately from imports and verify provider bindings, bean factories, or service registrations after the change.',
  ],
  [
    (a) => a.contractBindingNodes.length > 0,
    'Inspect API contract bindings separately from imports and verify schema roots, generated modules, and runtime handlers/clients after the change.',
  ],
  [
    (a) => a.securityFindings.length > 0,
    'Separately re-verify safe handling of secrets, shell/process APIs, and browser storage.',
  ],
  [
    (a) =>
      a.targetClassification.layer === 'application' ||
      a.targetClassification.layer === 'integration',
    'Ensure that orchestration/integration code does not start pulling presentation details or extra state.',
  ],
  [
    (a) => a.target.churn >= 10,
    'If the target is already a churn-heavy orchestration file, prefer extracting responsibilities instead of adding another branch, matcher, or adapter path.',
  ],
];

export function buildChangeNextSteps(args: ChangeNextStepsArgs) {
  const nextSteps = [
    `First, re-read the target node ${args.target.id} and the closest files from recommendedFilesToInspect.`,
    'Check if the change creates new layer violations or unnecessary import edges.',
  ];

  if (args.changeIntent) nextSteps.unshift(`Clarify change intent: ${args.changeIntent}.`);

  for (const [applies, step] of CONDITIONAL_NEXT_STEPS) {
    if (applies(args)) nextSteps.push(step);
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
