import { GraphData, GraphNode } from '../store/types';
import { toStructuralNodeId } from './AgentContextUtils';
import { ProjectInsightResult } from './ProjectInsightService';
import {
  CAMPAIGN_HINTS,
  hasDiRuntimeSignals,
  hasOperationalRefreshSignals,
  isChangeIntent,
} from './taskIntelligenceIntent';
import { NodeMatchWeights, scoreNodeTextMatch } from './nodeMatchScoring';
import type {
  TaskContextResult,
  TaskIntentInference,
  TaskRoutePlan,
} from './TaskIntelligenceService';

const MAX_CANDIDATES = 6;

type SelectedContext = TaskContextResult['selectedContext'];
type CampaignContext = Extract<SelectedContext, { kind: 'campaign' }>['context'];
type ChangeContext = Extract<SelectedContext, { kind: 'change' }>['context'];
type ReviewContext = Extract<SelectedContext, { kind: 'review' }>['context'];

function buildCampaignRoute(context: CampaignContext): TaskRoutePlan {
  return {
    initialTool: 'prepare_task_context',
    selectedCompositeTool: 'prepare_change_campaign',
    rationale:
      context.scope.runtimeCompositionRoots.length > 0
        ? 'The request affects runtime wiring and multiple composition roots, so the agent needs a campaign-level plan instead of a single-target edit.'
        : 'The request looks like a massive migration or major refactor, so the agent needs a campaign-level plan, not a single-target change context.',
    shouldInspectCodeImmediately: true,
    fallbackTools: ['search_graph', 'get_node_dependencies', 'get_blast_radius'],
  };
}

function describeChangeRoute(context: ChangeContext) {
  if (context.dependencies.runtimeContractLinks.length > 0) {
    return 'The request maps to a specific code target that also participates in runtime DI wiring, so a focused change context is the safest starting point.';
  }
  if (context.dependencies.contractBindingLinks.length > 0) {
    return 'The request maps to a specific code target that also participates in API contract/runtime bindings, so a focused change context is the safest starting point.';
  }
  return 'The request looks like a modification or bugfix, and CodeMaps successfully linked it to a specific code target.';
}

function buildChangeRoute(context: ChangeContext): TaskRoutePlan {
  return {
    initialTool: 'prepare_task_context',
    selectedCompositeTool: 'prepare_change_context',
    rationale: describeChangeRoute(context),
    shouldInspectCodeImmediately: true,
    fallbackTools: ['get_node_dependencies', 'get_blast_radius', 'search_graph'],
  };
}

function describeReviewRoute(
  keywords: string,
  targetCandidates: GraphNode[],
  projectContext: ProjectInsightResult
) {
  const telemetry = projectContext.operationalTelemetry;
  if (
    hasOperationalRefreshSignals(keywords) &&
    (telemetry.watcher.flushCount > 0 || telemetry.enrichment.runtimePriorityRebuilds > 0)
  ) {
    return 'The request targets incremental refresh behavior, so the agent should start with a review-style context focused on watcher batching, refresh latency, and rebuild hotspots.';
  }
  if (targetCandidates.length > 0) {
    return 'The request requires diagnostics/audit, so it is more useful for the agent to start with a review-style context on the found focus area.';
  }
  return 'The request could not be strictly linked to a single code target yet, so it is safer to start with a review-style context.';
}

function buildReviewRoute(
  keywords: string,
  targetCandidates: GraphNode[],
  projectContext: ProjectInsightResult
): TaskRoutePlan {
  return {
    initialTool: 'prepare_task_context',
    selectedCompositeTool: 'prepare_review_context',
    rationale: describeReviewRoute(keywords, targetCandidates, projectContext),
    shouldInspectCodeImmediately: targetCandidates.length > 0,
    fallbackTools: ['search_graph', 'get_architecture_overview', 'detect_patterns'],
  };
}

function describeProjectRoute(keywords: string, projectContext: ProjectInsightResult) {
  if (
    projectContext.mentalModel.runtimeCompositionRoots.length > 0 &&
    hasDiRuntimeSignals(keywords)
  ) {
    return 'The request mentions runtime wiring, but the scope is still too vague, so the agent should first load the broader project model and composition roots.';
  }
  if (
    hasOperationalRefreshSignals(keywords) &&
    projectContext.operationalTelemetry.watcher.flushCount > 0
  ) {
    return 'The request points to refresh/incremental behavior, but the target area is still vague, so the agent should start with the broader project model and operational telemetry.';
  }
  return 'The request is too general or not sufficiently tied to a code area, so the agent needs to start with a general mental model of the project.';
}

function buildProjectRoute(keywords: string, projectContext: ProjectInsightResult): TaskRoutePlan {
  return {
    initialTool: 'prepare_task_context',
    selectedCompositeTool: 'prepare_project_context',
    rationale: describeProjectRoute(keywords, projectContext),
    shouldInspectCodeImmediately: false,
    fallbackTools: ['prepare_review_context', 'search_graph', 'get_graph_context'],
  };
}

export function buildTaskRoute(
  inferredIntent: TaskIntentInference,
  targetCandidates: GraphNode[],
  selectedContext: SelectedContext,
  projectContext: ProjectInsightResult
): TaskRoutePlan {
  const keywords = inferredIntent.extractedKeywords.join(' ');
  switch (selectedContext?.kind) {
    case 'campaign':
      return buildCampaignRoute(selectedContext.context);
    case 'change':
      return buildChangeRoute(selectedContext.context);
    case 'review':
      return buildReviewRoute(keywords, targetCandidates, projectContext);
    default:
      return buildProjectRoute(keywords, projectContext);
  }
}

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

export function findTargetCandidates(
  graph: GraphData,
  candidateQueries: string[],
  projectContext: ProjectInsightResult,
  userRequest: string
) {
  const scored = new Map<string, { node: GraphNode; score: number }>();
  const runtimeRootIds = new Set(
    projectContext.mentalModel.runtimeCompositionRoots.map((node) => toStructuralNodeId(node.id))
  );
  const requestHasDiRuntimeSignals = hasDiRuntimeSignals(userRequest.toLowerCase());
  const requestHasOperationalRefreshSignals = hasOperationalRefreshSignals(
    userRequest.toLowerCase()
  );

  for (const query of candidateQueries) {
    for (const node of graph.nodes) {
      let score = scoreNodeMatch(node, query);
      if (requestHasDiRuntimeSignals && runtimeRootIds.has(toStructuralNodeId(node.id))) {
        score += 120;
      }
      if (
        requestHasOperationalRefreshSignals &&
        /(filewatcher|stackgraphenrichmentservice|graphrepository|projectindexer|cachemanager)/i.test(
          node.id
        )
      ) {
        score += 140;
      }
      if (score <= 0) {
        continue;
      }

      const current = scored.get(node.id);
      if (!current || score > current.score) {
        scored.set(node.id, { node, score });
      }
    }
  }

  return Array.from(scored.values())
    .sort(
      (a, b) =>
        b.score - a.score ||
        getNodeTypePriority(b.node.type) - getNodeTypePriority(a.node.type) ||
        a.node.label.localeCompare(b.node.label)
    )
    .slice(0, MAX_CANDIDATES)
    .map(({ node }) => node);
}

export function shouldUseCampaignContext(
  userRequest: string,
  inferredIntent: TaskIntentInference,
  targetCandidates: GraphNode[],
  projectContext: ProjectInsightResult
) {
  const normalized = userRequest.toLowerCase();
  const hasCampaignHints = CAMPAIGN_HINTS.some((hint) => normalized.includes(hint));
  const requestHasDiRuntimeSignals = hasDiRuntimeSignals(normalized);
  const hasExplicitFileMention =
    /[\p{L}\p{N}_./-]+\.(?:ts|tsx|js|jsx|json|css|md|cs|java|kt)/u.test(normalized);
  const hasBroadRuntimeScope =
    /(services|providers|registrations|bindings|contracts|modules|сервисы|провайдер|регистрац|контракт|модули)/u.test(
      normalized
    );

  if (
    hasExplicitFileMention &&
    targetCandidates.length > 0 &&
    targetCandidates[0].type === 'file' &&
    !hasBroadRuntimeScope
  ) {
    return false;
  }
  if (
    hasCampaignHints &&
    (isChangeIntent(inferredIntent.taskKind) || inferredIntent.taskKind === 'explore')
  ) {
    return true;
  }
  if (!isChangeIntent(inferredIntent.taskKind)) {
    return false;
  }
  if (
    requestHasDiRuntimeSignals &&
    projectContext.mentalModel.runtimeCompositionRoots.length > 0 &&
    (hasBroadRuntimeScope || targetCandidates.length >= 2)
  ) {
    return true;
  }

  return inferredIntent.taskKind === 'refactor' && targetCandidates.length >= 3;
}

const TASK_MATCH_WEIGHTS: NodeMatchWeights = {
  labelEquals: 160,
  basenameEquals: { file: 180, other: 90 },
  stemEquals: { file: 220, other: 100 },
  labelStarts: 90,
  basenameStarts: { file: 100, other: 50 },
  stemStarts: { file: 120, other: 60 },
  labelIncludes: 40,
  idIncludes: { file: 35, other: 20 },
};

const NODE_TYPE_PRIORITY = new Map([
  ['function', 6],
  ['class', 5],
  ['file', 4],
  ['adr', 3],
  ['directory', 1],
]);

function scoreNodeMatch(node: GraphNode, rawQuery: string) {
  const textScore = scoreNodeTextMatch(node, rawQuery, TASK_MATCH_WEIGHTS);
  return textScore === 0 ? 0 : textScore + getNodeTypePriority(node.type) * 10;
}

function getNodeTypePriority(type: string) {
  return NODE_TYPE_PRIORITY.get(type) ?? 2;
}
