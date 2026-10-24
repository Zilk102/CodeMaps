/**
 * Entry point for the whole-project overview that agents request first; re-exports its input and
 * result types.
 */

import { GraphData } from '../store/types';
import type { PrepareProjectContextInput, ProjectInsightResult } from './projectInsightTypes';
import { assembleProjectResult, collectProjectAssemblyContext } from './projectInsightAssembly';
import {
  createProjectInsightServices,
  type ProjectInsightServices,
} from './projectInsightServices';

export type { PrepareProjectContextInput, ProjectInsightResult } from './projectInsightTypes';

/**
 * Builds the project overview for agents from the services in `projectInsightServices`, which can
 * be replaced one by one (for tests).
 */
export class ProjectInsightService {
  private readonly services: ProjectInsightServices;

  constructor(services: Partial<ProjectInsightServices> = {}) {
    this.services = createProjectInsightServices(services);
  }

  /**
   * Analyzes the graph and returns the project overview: profile, architecture, health, patterns,
   * security, mental model, quality plan and next steps. The `limit` and `include*` options in the
   * input trim the result.
   */
  async prepareContext(
    graph: GraphData,
    input: PrepareProjectContextInput = {}
  ): Promise<ProjectInsightResult> {
    const ctx = await collectProjectAssemblyContext(this.services, graph, input);
    return assembleProjectResult(ctx, this.services);
  }
}
