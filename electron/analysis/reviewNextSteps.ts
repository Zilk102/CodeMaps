import type { ArchitectureOverview } from './ArchitectureInsightService';
import type { DecompositionGuidance } from './DecompositionGuidanceService';
import type { HealthScoreResult } from './HealthScoreAnalyzer';
import type { DetectedPattern } from './PatternDetectionAnalyzer';
import type { SecurityFinding } from './SecurityScanner';
import { applyStepRules, stepIfAny, stepWhen, type StepRule } from './stepRules';
import { hasDesignSmellSignals, hasRefreshPressure } from './reviewPriorityShared';

interface ReviewStepInput {
  health: HealthScoreResult;
  architecture: ArchitectureOverview;
  patterns: DetectedPattern[];
  hasFocus: boolean;
  decompositionGuidance: DecompositionGuidance;
}

type LinkCountKey = 'stackAwareLinks' | 'diRuntimeLinks' | 'contractSemanticLinks';

/** Applies while the health summary counts links of the given kind. */
const hasLinks = (key: LinkCountKey) => (input: ReviewStepInput) => input.health.summary[key] > 0;

/** Applied in order; each rule yields a step, or null when it does not apply. */
const REVIEW_STEP_RULES: Array<StepRule<ReviewStepInput>> = [
  stepIfAny(
    (i) => i.health.issues,
    'Cross-check health issues with the actual code and determine what is a real problem and what is heuristic noise.'
  ),
  stepWhen(
    hasLinks('stackAwareLinks'),
    'Review framework/build dependency paths separately from plain imports to verify entrypoints, routes, modules, and build descriptors.'
  ),
  stepWhen(
    hasLinks('diRuntimeLinks'),
    'Inspect DI runtime contracts separately from imports: verify provider tokens, bean factories, and service registrations against the actual concrete implementations.'
  ),
  stepWhen(
    hasLinks('contractSemanticLinks'),
    'Inspect API contract bindings separately from imports: verify schema roots, generated modules, and runtime handlers/clients against the actual operation/service symbols.'
  ),
  stepWhen(
    (i) => hasDesignSmellSignals(i.health),
    'Inspect design-smell hotspots separately: identify mixed responsibilities, god classes, long/complex methods, extraction boundaries, and files that should stop accumulating new stack-specific logic.'
  ),
  stepIfAny(
    (i) => i.decompositionGuidance.candidates,
    'Use structured decomposition candidates to review the exact classes and methods that should be extracted first, not just the surrounding files.'
  ),
  stepWhen(
    (i) => hasRefreshPressure(i.health),
    'Inspect incremental refresh telemetry separately: verify watcher batching, runtime-priority rebuild paths, refresh latency, and whether operational pressure matches the reported degradation.'
  ),
  stepWhen(
    (i) => i.architecture.summary.unknownNodes > 0,
    'Refine layer classification rules for unknown nodes so the agent and review rely on a more accurate model.'
  ),
  stepWhen(
    (i) => i.patterns.length === 0,
    'No obvious structural patterns found; the review should focus on code contracts and runtime behavior.'
  ),
  stepWhen(
    (i) => i.hasFocus,
    'After a general overview, do a separate local review for the focus area and check its blast radius manually.'
  ),
];

export function buildReviewNextSteps(
  health: HealthScoreResult,
  architecture: ArchitectureOverview,
  patterns: DetectedPattern[],
  securityFindings: SecurityFinding[],
  hasFocus: boolean,
  decompositionGuidance: DecompositionGuidance
) {
  const input: ReviewStepInput = {
    health,
    architecture,
    patterns,
    hasFocus,
    decompositionGuidance,
  };
  const nextSteps = [
    'Start the review with nodes that fell into top architecture violations and severe patterns.',
    'Check if high fan-in/high fan-out nodes hide excessive responsibility and incorrect module boundaries.',
    ...applyStepRules(REVIEW_STEP_RULES, input),
  ];

  if (securityFindings.length > 0) {
    nextSteps.unshift(
      'Address security findings first, especially critical and high severity ones.'
    );
  }

  return nextSteps;
}
