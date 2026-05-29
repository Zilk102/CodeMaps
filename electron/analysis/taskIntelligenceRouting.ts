import { GraphData, GraphNode } from '../store';
import { toStructuralNodeId, unique } from './AgentContextUtils';
import { ProjectInsightResult } from './ProjectInsightService';
import {
  CAMPAIGN_HINTS,
  hasDiRuntimeSignals,
  hasOperationalRefreshSignals,
  isChangeIntent,
} from './taskIntelligenceIntent';
import type { TaskContextResult, TaskIntentInference, TaskRoutePlan } from './TaskIntelligenceService';

const MAX_CANDIDATES = 6;

export function buildTaskRoute(
  inferredIntent: TaskIntentInference,
  targetCandidates: GraphNode[],
  selectedContext: TaskContextResult['selectedContext'],
  projectContext: ProjectInsightResult
): TaskRoutePlan {
  if (selectedContext?.kind === 'campaign') {
    return {
      initialTool: 'prepare_task_context',
      selectedCompositeTool: 'prepare_change_campaign',
      rationale:
        selectedContext.context.scope.runtimeCompositionRoots.length > 0
          ? 'The request affects runtime wiring and multiple composition roots, so the agent needs a campaign-level plan instead of a single-target edit.'
          : 'The request looks like a massive migration or major refactor, so the agent needs a campaign-level plan, not a single-target change context.',
      shouldInspectCodeImmediately: true,
      fallbackTools: ['search_graph', 'get_node_dependencies', 'get_blast_radius'],
    };
  }

  if (selectedContext?.kind === 'change') {
    return {
      initialTool: 'prepare_task_context',
      selectedCompositeTool: 'prepare_change_context',
      rationale:
        selectedContext.context.dependencies.runtimeContractLinks.length > 0
          ? 'The request maps to a specific code target that also participates in runtime DI wiring, so a focused change context is the safest starting point.'
          : selectedContext.context.dependencies.contractBindingLinks.length > 0
            ? 'The request maps to a specific code target that also participates in API contract/runtime bindings, so a focused change context is the safest starting point.'
            : 'The request looks like a modification or bugfix, and CodeMaps successfully linked it to a specific code target.',
      shouldInspectCodeImmediately: true,
      fallbackTools: ['get_node_dependencies', 'get_blast_radius', 'search_graph'],
    };
  }

  if (selectedContext?.kind === 'review') {
    return {
      initialTool: 'prepare_task_context',
      selectedCompositeTool: 'prepare_review_context',
      rationale:
        hasOperationalRefreshSignals(inferredIntent.extractedKeywords.join(' ')) &&
        (projectContext.operationalTelemetry.watcher.flushCount > 0 ||
          projectContext.operationalTelemetry.enrichment.runtimePriorityRebuilds > 0)
          ? 'The request targets incremental refresh behavior, so the agent should start with a review-style context focused on watcher batching, refresh latency, and rebuild hotspots.'
          : targetCandidates.length > 0
            ? 'The request requires diagnostics/audit, so it is more useful for the agent to start with a review-style context on the found focus area.'
            : 'The request could not be strictly linked to a single code target yet, so it is safer to start with a review-style context.',
      shouldInspectCodeImmediately: targetCandidates.length > 0,
      fallbackTools: ['search_graph', 'get_architecture_overview', 'detect_patterns'],
    };
  }

  return {
    initialTool: 'prepare_task_context',
    selectedCompositeTool: 'prepare_project_context',
    rationale:
      projectContext.mentalModel.runtimeCompositionRoots.length > 0 &&
      hasDiRuntimeSignals(inferredIntent.extractedKeywords.join(' '))
        ? 'The request mentions runtime wiring, but the scope is still too vague, so the agent should first load the broader project model and composition roots.'
        : hasOperationalRefreshSignals(inferredIntent.extractedKeywords.join(' ')) &&
            projectContext.operationalTelemetry.watcher.flushCount > 0
          ? 'The request points to refresh/incremental behavior, but the target area is still vague, so the agent should start with the broader project model and operational telemetry.'
          : 'The request is too general or not sufficiently tied to a code area, so the agent needs to start with a general mental model of the project.',
    shouldInspectCodeImmediately: false,
    fallbackTools: ['prepare_review_context', 'search_graph', 'get_graph_context'],
  };
}

export function buildTaskNextSteps(
  inferredIntent: TaskIntentInference,
  route: TaskRoutePlan,
  targetCandidates: GraphNode[],
  selectedContext: TaskContextResult['selectedContext']
) {
  const nextSteps = [
    `The agent has understood the intent as "${inferredIntent.taskKind}" and selected the primary composite tool "${route.selectedCompositeTool}".`,
  ];

  if (targetCandidates.length > 0) {
    nextSteps.push(`First target candidate: ${targetCandidates[0].id}.`);
  } else {
    nextSteps.push('No clear code target found yet; use focus candidates and project mental model to refine the scope.');
  }

  if (selectedContext?.kind === 'change') {
    nextSteps.push('Next, the agent should read change-context risks, blast radius, and recommendedFilesToInspect before editing.');
    if (selectedContext.context.decompositionCandidates.length > 0) {
      nextSteps.push(`Because the target already has decomposition candidates, prefer starting with ${selectedContext.context.decompositionCandidates[0].targetLabel} as the first extraction seam.`);
    }
    if (selectedContext.context.dependencies.runtimeContractLinks.length > 0) {
      nextSteps.push('Because the target touches runtime DI wiring, the agent should verify composition roots and concrete registrations before modifying contracts.');
    }
    if (selectedContext.context.dependencies.contractBindingLinks.length > 0) {
      nextSteps.push('Because the target touches API contract/runtime bindings, the agent should verify schema roots, generated modules, and bound handlers/clients before editing the implementation.');
    }
  } else if (selectedContext?.kind === 'campaign') {
    nextSteps.push('Next, the agent should read execution waves, affected files, and campaign risks, then perform the migration in phases.');
    nextSteps.push('Review refactoring waves as the architectural cleanup track for the campaign, even if only a subset of files currently has ranked extraction candidates.');
    if (selectedContext.context.scope.runtimeCompositionRoots.length > 0) {
      nextSteps.push('Campaign scope includes runtime composition roots, so migration should start from DI wiring and only then move to dependent files.');
    }
    if (selectedContext.context.executionPlan.refactoringWaves.length > 0) {
      nextSteps.push(`Campaign already includes refactoring waves; start with ${selectedContext.context.executionPlan.refactoringWaves[0].title} before broader rollout.`);
    }
    if (selectedContext.context.qualityDashboard.gates.some((gate) => gate.status === 'block')) {
      nextSteps.push('Quality dashboard contains blocking gates, so campaign execution should stay in stabilization/refactoring mode until those gates are cleared.');
    }
  } else if (selectedContext?.kind === 'review') {
    nextSteps.push('Next, the agent should read review priorities, patterns, and architecture summary before diving deep into the code.');
    if (
      hasOperationalRefreshSignals(route.rationale.toLowerCase()) ||
      selectedContext.context.reviewPriorities.some((priority) => priority.title === 'Incremental Refresh Pipeline')
    ) {
      nextSteps.push('Because the focus includes incremental refresh behavior, the agent should inspect watcher batching, skipped refreshes, and runtime-priority rebuild latency before editing pipeline code.');
    }
    if (
      selectedContext.context.reviewPriorities.some(
        (priority) => priority.title === 'Design Smells' || priority.title === 'Maintainability Budget'
      )
    ) {
      nextSteps.push('Because the focus includes maintainability debt, the agent should prefer extraction boundaries and class/method decomposition over additive edits in already overloaded modules.');
    }
    if (selectedContext.context.decompositionGuidance.candidates.length > 0) {
      nextSteps.push(`Use the review decomposition guidance as a ranked extraction queue; current top candidate: ${selectedContext.context.decompositionGuidance.candidates[0].targetLabel}.`);
    }
    if (selectedContext.context.qualityDashboard.gates.some((gate) => gate.status === 'block')) {
      nextSteps.push('Because quality dashboard gates are blocking, the review should treat growth in hotspot areas as disallowed until the first remediation wave is complete.');
    }
  } else {
    nextSteps.push('Next, the agent should select a focusQuery from candidateQueries and then dive into the review/change context.');
  }

  return nextSteps;
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
  const requestHasOperationalRefreshSignals = hasOperationalRefreshSignals(userRequest.toLowerCase());

  for (const query of candidateQueries) {
    for (const node of graph.nodes) {
      let score = scoreNodeMatch(node, query);
      if (requestHasDiRuntimeSignals && runtimeRootIds.has(toStructuralNodeId(node.id))) {
        score += 120;
      }
      if (
        requestHasOperationalRefreshSignals &&
        /(filewatcher|stackgraphenrichmentservice|graphrepository|projectindexer|cachemanager)/i.test(node.id)
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

  if (hasExplicitFileMention && targetCandidates.length > 0 && targetCandidates[0].type === 'file' && !hasBroadRuntimeScope) {
    return false;
  }
  if (hasCampaignHints && (isChangeIntent(inferredIntent.taskKind) || inferredIntent.taskKind === 'explore')) {
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

function scoreNodeMatch(node: GraphNode, rawQuery: string) {
  const normalizedQuery = rawQuery.trim().toLowerCase();
  if (!normalizedQuery) {
    return 0;
  }

  const normalizedLabel = node.label.toLowerCase();
  const normalizedId = node.id.toLowerCase();
  const structuralId = toStructuralNodeId(normalizedId);
  const basename = structuralId.split('/').pop() || structuralId;
  const basenameWithoutExtension = basename.replace(/\.[^.]+$/u, '');
  let textScore = 0;

  if (normalizedLabel === normalizedQuery) textScore += 160;
  if (basename === normalizedQuery) textScore += node.type === 'file' ? 180 : 90;
  if (basenameWithoutExtension === normalizedQuery) textScore += node.type === 'file' ? 220 : 100;
  if (normalizedLabel.startsWith(normalizedQuery)) textScore += 90;
  if (basename.startsWith(normalizedQuery)) textScore += node.type === 'file' ? 100 : 50;
  if (basenameWithoutExtension.startsWith(normalizedQuery)) textScore += node.type === 'file' ? 120 : 60;
  if (normalizedLabel.includes(normalizedQuery)) textScore += 40;
  if (normalizedId.includes(normalizedQuery)) textScore += node.type === 'file' ? 35 : 20;

  if (textScore === 0) {
    return 0;
  }

  return textScore + getNodeTypePriority(node.type) * 10;
}

function getNodeTypePriority(type: string) {
  switch (type) {
    case 'function':
      return 6;
    case 'class':
      return 5;
    case 'file':
      return 4;
    case 'adr':
      return 3;
    case 'directory':
      return 1;
    default:
      return 2;
  }
}
