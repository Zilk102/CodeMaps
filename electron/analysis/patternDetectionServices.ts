/** Default wiring of the collaborators the pattern detection analyzer works with. */
import { ArchitectureInsightService } from './ArchitectureInsightService';
import { createServices, type ServiceBundle } from './serviceWiring';

/** The collaborators of pattern detection. */
const PATTERN_DETECTION_SERVICES = {
  architectureInsightService: ArchitectureInsightService,
};

/** The collaborator instances pattern detection needs, keyed by role. */
export type PatternDetectionServices = ServiceBundle<typeof PATTERN_DETECTION_SERVICES>;

/** Default wiring; the architecture analysis can be replaced (tests, embedding). */
export const createPatternDetectionServices = (overrides: Partial<PatternDetectionServices> = {}) =>
  createServices(PATTERN_DETECTION_SERVICES, overrides);
