/** Default wiring of the collaborators the health score analyzer measures with. */
import { ArchitectureInsightService } from './ArchitectureInsightService';
import { documentationIndex, type DocumentationIndex } from './documentation';
import { createServices } from './serviceWiring';

/** The collaborators of the health score analyzer, keyed by role. */
export interface HealthScoreServices {
  architectureInsight: ArchitectureInsightService;
  documentation: Pick<DocumentationIndex, 'peek'>;
}

/** Default wiring (the shared documentation index); every member can be replaced for tests. */
export const createHealthScoreServices = (
  overrides: Partial<HealthScoreServices> = {}
): HealthScoreServices => ({
  ...createServices({ architectureInsight: ArchitectureInsightService }),
  documentation: documentationIndex,
  ...overrides,
});
