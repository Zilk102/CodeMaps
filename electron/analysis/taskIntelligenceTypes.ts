import { GraphNode } from '../store/types';
import type { ChangeContextResult } from './ChangeContextService';
import type { ReviewContextResult } from './ReviewContextService';
import type { ChangeCampaignResult } from './ChangeCampaignService';
import type { PrepareProjectContextInput, ProjectInsightResult } from './projectInsightTypes';

export type RoutedTaskKind =
  | 'bugfix'
  | 'feature'
  | 'refactor'
  | 'review'
  | 'architecture'
  | 'security'
  | 'stabilization'
  | 'explore';

export interface PrepareTaskContextInput extends PrepareProjectContextInput {
  userRequest: string;
  depth?: number;
}

export interface TaskIntentInference {
  taskKind: RoutedTaskKind;
  confidence: 'high' | 'medium' | 'low';
  reasoning: string[];
  extractedKeywords: string[];
}

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
