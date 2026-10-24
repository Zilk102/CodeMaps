/** Default wiring of the analyzers used by the review context service. */
import { AnalysisSnapshotService } from './AnalysisSnapshotService';
import { DecompositionGuidanceService } from './DecompositionGuidanceService';
import { QualityGovernanceService } from './QualityGovernanceService';
import { createServices, withoutUndefined, type ServiceBundle } from './serviceWiring';

/** The services the review context is built from. */
const REVIEW_CONTEXT_SERVICES = {
  analysisSnapshotService: AnalysisSnapshotService,
  decompositionGuidanceService: DecompositionGuidanceService,
  qualityGovernanceService: QualityGovernanceService,
};

/** The service instances a review context needs, keyed by role. */
export type ReviewContextServices = ServiceBundle<typeof REVIEW_CONTEXT_SERVICES>;

/** Wires the services from the service constructor's positional, optional arguments. */
export const createReviewContextServicesFrom = (
  analysisSnapshotService?: AnalysisSnapshotService,
  decompositionGuidanceService?: DecompositionGuidanceService,
  qualityGovernanceService?: QualityGovernanceService
): ReviewContextServices =>
  createReviewContextServices(
    withoutUndefined({
      analysisSnapshotService,
      decompositionGuidanceService,
      qualityGovernanceService,
    })
  );

/** Default wiring; every service can be replaced one by one. */
export const createReviewContextServices = (overrides: Partial<ReviewContextServices> = {}) =>
  createServices(REVIEW_CONTEXT_SERVICES, overrides);
