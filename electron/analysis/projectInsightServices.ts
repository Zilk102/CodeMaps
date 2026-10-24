import { AnalysisSnapshotService } from './AnalysisSnapshotService';
import { DecompositionGuidanceService } from './DecompositionGuidanceService';
import { QualityGovernanceService } from './QualityGovernanceService';
import { createServices, type ServiceBundle } from './serviceWiring';
import { StackInsightService } from './StackInsightService';
import { StackTopologyService } from './StackTopologyService';

/** The analysis services project insight draws on. */
const PROJECT_INSIGHT_SERVICES = {
  analysisSnapshot: AnalysisSnapshotService,
  stackInsight: StackInsightService,
  stackTopology: StackTopologyService,
  decompositionGuidance: DecompositionGuidanceService,
  qualityGovernance: QualityGovernanceService,
};

export type ProjectInsightServices = ServiceBundle<typeof PROJECT_INSIGHT_SERVICES>;

export const createProjectInsightServices = (overrides: Partial<ProjectInsightServices> = {}) =>
  createServices(PROJECT_INSIGHT_SERVICES, overrides);
