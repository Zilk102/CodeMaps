import { GraphData, GraphNode } from '../store/types';
import type { ProjectInsightResult } from './projectInsightTypes';
import { shouldUseCampaignContext } from './taskIntelligenceCandidates';
import {
  isChangeIntent,
  isReviewIntent,
  toChangeTaskMode,
  toReviewTaskMode,
} from './taskIntelligenceIntent';
import type { TaskIntelligenceServices } from './taskIntelligenceServices';
import type {
  PrepareTaskContextInput,
  TaskContextResult,
  TaskIntentInference,
} from './taskIntelligenceTypes';

type SelectedContext = TaskContextResult['selectedContext'];

/** What the routing decided before a context service is picked. */
export interface SelectionRequest {
  graph: GraphData;
  input: PrepareTaskContextInput;
  inferredIntent: TaskIntentInference;
  targetCandidates: GraphNode[];
  candidateQueries: string[];
  projectContext: ProjectInsightResult;
}

/** The options a change-style context (campaign or single change) shares. */
function sharedChangeOptions({ input, inferredIntent }: SelectionRequest) {
  return {
    taskMode: toChangeTaskMode(inferredIntent.taskKind),
    depth: input.depth,
    includeSecurityFindings: input.includeSecurityFindings,
  };
}

async function selectCampaign(
  services: TaskIntelligenceServices,
  request: SelectionRequest
): Promise<SelectedContext> {
  const { graph, input, inferredIntent, targetCandidates, candidateQueries, projectContext } =
    request;
  if (
    !shouldUseCampaignContext(input.userRequest, inferredIntent, targetCandidates, projectContext)
  ) {
    return null;
  }
  const context = await services.changeCampaign.prepareContext(graph, {
    userRequest: input.userRequest,
    candidateQueries,
    seedNodeIds: targetCandidates.map((node) => node.id),
    maxSeeds: Math.max(targetCandidates.length, 6),
    maxFiles: 30,
    ...sharedChangeOptions(request),
  });
  return { kind: 'campaign', context };
}

async function selectChange(
  services: TaskIntelligenceServices,
  request: SelectionRequest
): Promise<SelectedContext> {
  const { graph, input, inferredIntent, targetCandidates } = request;
  if (!isChangeIntent(inferredIntent.taskKind) || targetCandidates.length === 0) return null;
  const context = await services.changeContext.prepareChangeContext(graph, {
    target: targetCandidates[0].id,
    changeIntent: input.userRequest,
    ...sharedChangeOptions(request),
  });
  return { kind: 'change', context };
}

async function selectReview(
  services: TaskIntelligenceServices,
  request: SelectionRequest
): Promise<SelectedContext> {
  const { graph, input, inferredIntent, targetCandidates, candidateQueries } = request;
  if (!isReviewIntent(inferredIntent.taskKind) && candidateQueries.length === 0) return null;
  const context = await services.reviewContext.prepareReviewContext(graph, {
    focusQuery: targetCandidates[0]?.label || candidateQueries[0],
    taskMode: toReviewTaskMode(inferredIntent.taskKind),
    limit: input.limit,
    includeSecurityFindings: input.includeSecurityFindings,
    includeClassifications: input.includeClassifications,
  });
  return { kind: 'review', context };
}

/** The first context service whose conditions hold prepares the context; none may apply. */
export async function prepareSelectedContext(
  services: TaskIntelligenceServices,
  request: SelectionRequest
): Promise<SelectedContext> {
  for (const select of [selectCampaign, selectChange, selectReview]) {
    const selected = await select(services, request);
    if (selected) return selected;
  }
  return null;
}
