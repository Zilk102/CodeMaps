import { GraphNode } from '../store/types';
import { hasOperationalRefreshSignals } from './taskIntelligenceIntent';
import type {
  TaskContextResult,
  TaskIntentInference,
  TaskRoutePlan,
} from './TaskIntelligenceService';

type SelectedContext = TaskContextResult['selectedContext'];
type CampaignContext = Extract<SelectedContext, { kind: 'campaign' }>['context'];
type ChangeContext = Extract<SelectedContext, { kind: 'change' }>['context'];
type ReviewContext = Extract<SelectedContext, { kind: 'review' }>['context'];

const hasBlockingGate = (context: CampaignContext | ReviewContext) =>
  context.qualityDashboard.gates.some((gate) => gate.status === 'block');

function buildChangeNextSteps(context: ChangeContext) {
  const steps = [
    'Next, the agent should read change-context risks, blast radius, and recommendedFilesToInspect before editing.',
  ];
  if (context.decompositionCandidates.length > 0) {
    steps.push(
      `Because the target already has decomposition candidates, prefer starting with ${context.decompositionCandidates[0].targetLabel} as the first extraction seam.`
    );
  }
  if (context.dependencies.runtimeContractLinks.length > 0) {
    steps.push(
      'Because the target touches runtime DI wiring, the agent should verify composition roots and concrete registrations before modifying contracts.'
    );
  }
  if (context.dependencies.contractBindingLinks.length > 0) {
    steps.push(
      'Because the target touches API contract/runtime bindings, the agent should verify schema roots, generated modules, and bound handlers/clients before editing the implementation.'
    );
  }
  return steps;
}

function buildCampaignNextSteps(context: CampaignContext) {
  const steps = [
    'Next, the agent should read execution waves, affected files, and campaign risks, then perform the migration in phases.',
    'Review refactoring waves as the architectural cleanup track for the campaign, even if only a subset of files currently has ranked extraction candidates.',
  ];
  if (context.scope.runtimeCompositionRoots.length > 0) {
    steps.push(
      'Campaign scope includes runtime composition roots, so migration should start from DI wiring and only then move to dependent files.'
    );
  }
  if (context.executionPlan.refactoringWaves.length > 0) {
    steps.push(
      `Campaign already includes refactoring waves; start with ${context.executionPlan.refactoringWaves[0].title} before broader rollout.`
    );
  }
  if (hasBlockingGate(context)) {
    steps.push(
      'Quality dashboard contains blocking gates, so campaign execution should stay in stabilization/refactoring mode until those gates are cleared.'
    );
  }
  return steps;
}

function buildReviewNextSteps(context: ReviewContext, route: TaskRoutePlan) {
  const steps = [
    'Next, the agent should read review priorities, patterns, and architecture summary before diving deep into the code.',
  ];
  const hasPriority = (...titles: string[]) =>
    context.reviewPriorities.some((priority) => titles.includes(priority.title));

  if (
    hasOperationalRefreshSignals(route.rationale.toLowerCase()) ||
    hasPriority('Incremental Refresh Pipeline')
  ) {
    steps.push(
      'Because the focus includes incremental refresh behavior, the agent should inspect watcher batching, skipped refreshes, and runtime-priority rebuild latency before editing pipeline code.'
    );
  }
  if (hasPriority('Design Smells', 'Maintainability Budget')) {
    steps.push(
      'Because the focus includes maintainability debt, the agent should prefer extraction boundaries and class/method decomposition over additive edits in already overloaded modules.'
    );
  }
  if (context.decompositionGuidance.candidates.length > 0) {
    steps.push(
      `Use the review decomposition guidance as a ranked extraction queue; current top candidate: ${context.decompositionGuidance.candidates[0].targetLabel}.`
    );
  }
  if (hasBlockingGate(context)) {
    steps.push(
      'Because quality dashboard gates are blocking, the review should treat growth in hotspot areas as disallowed until the first remediation wave is complete.'
    );
  }
  return steps;
}

function buildContextNextSteps(selectedContext: SelectedContext, route: TaskRoutePlan) {
  switch (selectedContext?.kind) {
    case 'change':
      return buildChangeNextSteps(selectedContext.context);
    case 'campaign':
      return buildCampaignNextSteps(selectedContext.context);
    case 'review':
      return buildReviewNextSteps(selectedContext.context, route);
    default:
      return [
        'Next, the agent should select a focusQuery from candidateQueries and then dive into the review/change context.',
      ];
  }
}

export function buildTaskNextSteps(
  inferredIntent: TaskIntentInference,
  route: TaskRoutePlan,
  targetCandidates: GraphNode[],
  selectedContext: SelectedContext
) {
  const targetStep =
    targetCandidates.length > 0
      ? `First target candidate: ${targetCandidates[0].id}.`
      : 'No clear code target found yet; use focus candidates and project mental model to refine the scope.';

  return [
    `The agent has understood the intent as "${inferredIntent.taskKind}" and selected the primary composite tool "${route.selectedCompositeTool}".`,
    targetStep,
    ...buildContextNextSteps(selectedContext, route),
  ];
}
