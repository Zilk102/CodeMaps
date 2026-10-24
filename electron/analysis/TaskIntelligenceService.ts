/**
 * Turns a free-text task request into a routed plan: inferred intent, likely target symbols, the
 * matching specialised context (change, campaign or review) and the next tool calls for an agent.
 */
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

/**
 * Entry point of the task router behind `prepare_task_context`; collaborating services can be replaced for tests.
 */
export class TaskIntelligenceService {
  private readonly services: TaskIntelligenceServices;

  constructor(services: Partial<TaskIntelligenceServices> = {}) {
    this.services = createTaskIntelligenceServices(services);
  }

  /**
   * Infers the intent of `input.userRequest`, finds target candidates in the graph, prepares the
   * matching context and returns the route and next steps. Only reads the graph, writes nothing.
   */
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
