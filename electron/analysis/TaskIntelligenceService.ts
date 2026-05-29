import { GraphData, GraphNode } from '../store';
import {
  ChangeContextResult,
  ChangeTaskMode,
  ChangeContextService,
} from './ChangeContextService';
import {
  ReviewContextResult,
  ReviewTaskMode,
  ReviewContextService,
} from './ReviewContextService';
import {
  PrepareProjectContextInput,
  ProjectInsightResult,
  ProjectInsightService,
} from './ProjectInsightService';
import { ChangeCampaignResult, ChangeCampaignService } from './ChangeCampaignService';
import {
  extractCandidateQueries,
  inferTaskIntent,
  isChangeIntent,
  isReviewIntent,
  toChangeTaskMode,
  toReviewTaskMode,
} from './taskIntelligenceIntent';
import {
  buildTaskNextSteps,
  buildTaskRoute,
  findTargetCandidates,
  shouldUseCampaignContext,
} from './taskIntelligenceRouting';

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

export class TaskIntelligenceService {
  constructor(
    private readonly projectInsightService = new ProjectInsightService(),
    private readonly changeContextService = new ChangeContextService(),
    private readonly reviewContextService = new ReviewContextService(),
    private readonly changeCampaignService = new ChangeCampaignService()
  ) {}

  async prepareContext(
    graph: GraphData,
    input: PrepareTaskContextInput
  ): Promise<TaskContextResult> {
    const inferredIntent = inferTaskIntent(input.userRequest);
    const candidateQueries = extractCandidateQueries(input.userRequest);
    const projectContext = await this.projectInsightService.prepareContext(graph, input);
    const targetCandidates = findTargetCandidates(
      graph,
      candidateQueries,
      projectContext,
      input.userRequest
    );
    const selectedContext = await this.prepareSelectedContext(
      graph,
      inferredIntent,
      targetCandidates,
      candidateQueries,
      input,
      projectContext
    );
    const route = buildTaskRoute(inferredIntent, targetCandidates, selectedContext, projectContext);

    return {
      graphSummary: projectContext.graphSummary,
      userRequest: input.userRequest,
      inferredIntent,
      projectContext,
      focus: {
        candidateQueries,
        targetCandidates,
      },
      route,
      selectedContext,
      nextSteps: buildTaskNextSteps(inferredIntent, route, targetCandidates, selectedContext),
    };
  }

  private async prepareSelectedContext(
    graph: GraphData,
    inferredIntent: TaskIntentInference,
    targetCandidates: GraphNode[],
    candidateQueries: string[],
    input: PrepareTaskContextInput,
    projectContext: ProjectInsightResult
  ): Promise<TaskContextResult['selectedContext']> {
    if (
      shouldUseCampaignContext(
        input.userRequest,
        inferredIntent,
        targetCandidates,
        projectContext
      )
    ) {
      const context = await this.changeCampaignService.prepareContext(graph, {
        userRequest: input.userRequest,
        candidateQueries,
        seedNodeIds: targetCandidates.map((node) => node.id),
        taskMode: toChangeTaskMode(inferredIntent.taskKind),
        depth: input.depth,
        maxSeeds: Math.max(targetCandidates.length, 6),
        maxFiles: 30,
        includeSecurityFindings: input.includeSecurityFindings,
      });
      return { kind: 'campaign', context };
    }

    if (isChangeIntent(inferredIntent.taskKind) && targetCandidates.length > 0) {
      const context = await this.changeContextService.prepareChangeContext(graph, {
        target: targetCandidates[0].id,
        taskMode: toChangeTaskMode(inferredIntent.taskKind),
        changeIntent: input.userRequest,
        depth: input.depth,
        includeSecurityFindings: input.includeSecurityFindings,
      });
      return { kind: 'change', context };
    }

    if (isReviewIntent(inferredIntent.taskKind) || candidateQueries.length > 0) {
      const focusQuery = targetCandidates[0]?.label || candidateQueries[0];
      const context = await this.reviewContextService.prepareReviewContext(graph, {
        focusQuery,
        taskMode: toReviewTaskMode(inferredIntent.taskKind),
        limit: input.limit,
        includeSecurityFindings: input.includeSecurityFindings,
        includeClassifications: input.includeClassifications,
      });
      return { kind: 'review', context };
    }

    return null;
  }
}
