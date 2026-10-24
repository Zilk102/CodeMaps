import { GraphNode } from '../store/types';
import type { ProjectInsightResult } from './projectInsightTypes';
import { hasDiRuntimeSignals, hasOperationalRefreshSignals } from './taskIntelligenceIntent';
import type {
  TaskContextResult,
  TaskIntentInference,
  TaskRoutePlan,
} from './taskIntelligenceTypes';

type SelectedContext = TaskContextResult['selectedContext'];
type CampaignContext = Extract<SelectedContext, { kind: 'campaign' }>['context'];
type ChangeContext = Extract<SelectedContext, { kind: 'change' }>['context'];

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
