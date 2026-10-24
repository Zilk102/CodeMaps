import { GraphData } from '../store/types';
import type { PrepareProjectContextInput, ProjectInsightResult } from './projectInsightTypes';
import { assembleProjectResult, collectProjectAssemblyContext } from './projectInsightAssembly';
import {
  createProjectInsightServices,
  type ProjectInsightServices,
} from './projectInsightServices';

export type { PrepareProjectContextInput, ProjectInsightResult } from './projectInsightTypes';

export class ProjectInsightService {
  private readonly services: ProjectInsightServices;

  constructor(services: Partial<ProjectInsightServices> = {}) {
    this.services = createProjectInsightServices(services);
  }

  async prepareContext(
    graph: GraphData,
    input: PrepareProjectContextInput = {}
  ): Promise<ProjectInsightResult> {
    const ctx = await collectProjectAssemblyContext(this.services, graph, input);
    return assembleProjectResult(ctx, this.services);
  }
}
