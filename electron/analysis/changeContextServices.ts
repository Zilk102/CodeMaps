import { ArchitectureInsightService } from './ArchitectureInsightService';
import { BlastRadiusAnalyzer } from './BlastRadiusAnalyzer';
import { DecompositionGuidanceService } from './DecompositionGuidanceService';
import { PatternDetectionAnalyzer } from './PatternDetectionAnalyzer';
import { SecurityScanner } from './SecurityScanner';
import { createServices, type ServiceBundle } from './serviceWiring';

/** The analyzers the change context is built from. */
const CHANGE_CONTEXT_SERVICES = {
  architectureInsightService: ArchitectureInsightService,
  blastRadiusAnalyzer: BlastRadiusAnalyzer,
  patternDetectionAnalyzer: PatternDetectionAnalyzer,
  securityScanner: SecurityScanner,
  decompositionGuidanceService: DecompositionGuidanceService,
};

export type ChangeContextServices = ServiceBundle<typeof CHANGE_CONTEXT_SERVICES>;

/** Default wiring; every service can be replaced one by one. */
export const createChangeContextServices = (overrides: Partial<ChangeContextServices> = {}) =>
  createServices(CHANGE_CONTEXT_SERVICES, overrides);
