import { AnalysisSnapshotService } from './AnalysisSnapshotService';
import { DecompositionGuidanceService } from './DecompositionGuidanceService';
import { QualityGovernanceService } from './QualityGovernanceService';
import { StackInsightService } from './StackInsightService';
import { StackTopologyService } from './StackTopologyService';

/** The analysis services project insight draws on. */
export interface ProjectInsightServices {
  analysisSnapshot: AnalysisSnapshotService;
  stackInsight: StackInsightService;
  stackTopology: StackTopologyService;
  decompositionGuidance: DecompositionGuidanceService;
  qualityGovernance: QualityGovernanceService;
}

export function createProjectInsightServices(
  overrides: Partial<ProjectInsightServices> = {}
): ProjectInsightServices {
  return {
    analysisSnapshot: new AnalysisSnapshotService(),
    stackInsight: new StackInsightService(),
    stackTopology: new StackTopologyService(),
    decompositionGuidance: new DecompositionGuidanceService(),
    qualityGovernance: new QualityGovernanceService(),
    ...overrides,
  };
}
