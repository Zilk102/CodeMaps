import { GraphData } from '../store/types';
import { findTargetCandidates } from './taskIntelligenceCandidates';
import { prepareSelectedContext } from './taskIntelligenceContext';
import { extractCandidateQueries, inferTaskIntent } from './taskIntelligenceIntent';
import { buildTaskNextSteps } from './taskIntelligenceNextSteps';
import { buildTaskRoute } from './taskIntelligenceRouting';
import {
  createTaskIntelligenceServices,
  type TaskIntelligenceServices,
} from './taskIntelligenceServices';
import type { PrepareTaskContextInput, TaskContextResult } from './taskIntelligenceTypes';

export class TaskIntelligenceService {
  private readonly services: TaskIntelligenceServices;

  constructor(services: Partial<TaskIntelligenceServices> = {}) {
    this.services = createTaskIntelligenceServices(services);
  }

  async prepareContext(
    graph: GraphData,
    input: PrepareTaskContextInput
  ): Promise<TaskContextResult> {
    const inferredIntent = inferTaskIntent(input.userRequest);
    const candidateQueries = extractCandidateQueries(input.userRequest);
    const projectContext = await this.services.projectInsight.prepareContext(graph, input);
    const targetCandidates = findTargetCandidates(
      graph,
      candidateQueries,
      projectContext,
      input.userRequest
    );
    const selectedContext = await prepareSelectedContext(this.services, {
      graph,
      input,
      inferredIntent,
      targetCandidates,
      candidateQueries,
      projectContext,
    });
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
}
