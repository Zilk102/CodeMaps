/**
 * Types of the task router: the request, the intent inferred from it, the chosen route and the combined result.
 */
import { GraphNode } from '../store/types';
import type { ChangeContextResult } from './ChangeContextService';
import type { ReviewContextResult } from './ReviewContextService';
import type { ChangeCampaignResult } from './ChangeCampaignService';
import type { PrepareProjectContextInput, ProjectInsightResult } from './projectInsightTypes';

/** Kind of work a request is routed as; decides which context tool is selected. */
export type RoutedTaskKind =
  | 'bugfix'
  | 'feature'
  | 'refactor'
  | 'review'
  | 'architecture'
  | 'security'
  | 'stabilization'
  | 'explore';

/**
 * Input of `prepare_task_context`: the user's request in natural language plus the project-context options.
 */
export interface PrepareTaskContextInput extends PrepareProjectContextInput {
  userRequest: string;
  depth?: number;
}

/**
 * The inferred task kind with its confidence, the reasons for it and the keywords taken from the request.
 */
export interface TaskIntentInference {
  taskKind: RoutedTaskKind;
  confidence: 'high' | 'medium' | 'low';
  reasoning: string[];
  extractedKeywords: string[];
}

/**
 * Which composite tool to use for the task and why, and the tools to fall back to if it is not enough.
 */
export interface TaskRoutePlan {
  initialTool: 'prepare_task_context';
  selectedCompositeTool:
    | 'prepare_project_context'
    | 'prepare_change_context'
    | 'prepare_change_campaign'
    | 'prepare_review_context';
  rationale: string;
  shouldInspectCodeImmediately: boolean;
  fallbackTools: string[];
}

/**
 * Everything the router returns: summary, intent, project context, focus, route, the specialised context if one was selected and next steps.
 */
export interface TaskContextResult {
  graphSummary: ProjectInsightResult['graphSummary'];
  userRequest: string;
  inferredIntent: TaskIntentInference;
  projectContext: ProjectInsightResult;
  focus: {
    candidateQueries: string[];
    targetCandidates: GraphNode[];
  };
  route: TaskRoutePlan;
  selectedContext:
    | { kind: 'campaign'; context: ChangeCampaignResult }
    | { kind: 'change'; context: ChangeContextResult }
    | { kind: 'review'; context: ReviewContextResult }
    | null;
  nextSteps: string[];
}
