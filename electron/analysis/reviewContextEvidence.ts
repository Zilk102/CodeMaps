/**
 * Evidence gathering for the review context: runs the architecture, health, pattern and security
 * analyses, resolves the optional focus area and derives decomposition and quality artifacts.
 */
import type { GraphData } from '../store/types';
import type { ArchitectureOverview } from './ArchitectureInsightService';
import type { DecompositionGuidance } from './DecompositionGuidanceService';
import type { HealthScoreResult } from './HealthScoreAnalyzer';
import type { DetectedPattern } from './PatternDetectionAnalyzer';
import type { SecurityFinding } from './SecurityScanner';
import { buildQualityArtifacts } from './contextSupport';
import { prepareReviewFocusContext } from './reviewContextSupport';
import type { ReviewContextServices } from './reviewContextServices';
import type { PrepareReviewContextInput, ReviewContextResult } from './reviewContextTypes';

/** Default cap on patterns, violations and guidance entries when the caller gives no limit. */
export const MAX_REVIEW_PATTERNS = 12;

/** Raw analyses and derived artifacts a review result is assembled from. */
export interface ReviewEvidence {
  architecture: ArchitectureOverview;
  health: HealthScoreResult;
  patterns: DetectedPattern[];
  securityFindings: SecurityFinding[];
  focus: ReviewContextResult['focus'];
  decompositionGuidance: DecompositionGuidance;
  quality: ReturnType<typeof buildQualityArtifacts>;
}

/** Runs every analysis the review needs once, so assembly stays a pure function of the evidence. */
export async function collectReviewEvidence(
  services: ReviewContextServices,
  graph: GraphData,
  input: PrepareReviewContextInput
): Promise<ReviewEvidence> {
  const limit = input.limit || MAX_REVIEW_PATTERNS;
  const snapshot = await services.analysisSnapshotService.analyzeWithHealth(
    graph,
    input.includeSecurityFindings,
    limit
  );
  const { architecture, health, patterns } = snapshot;
  const focus = prepareReviewFocusContext(
    graph,
    architecture,
    patterns,
    input.focusQuery,
    input.type
  );
  const decompositionGuidance = services.decompositionGuidanceService.prepareGuidance(graph, {
    limit,
    focusNodeIds: focus?.matches.map((node) => node.id),
  });
  const quality = buildQualityArtifacts(
    graph,
    health,
    patterns,
    decompositionGuidance,
    services.qualityGovernanceService,
    4
  );

  return {
    architecture,
    health,
    patterns,
    securityFindings: snapshot.security.findings,
    focus,
    decompositionGuidance,
    quality,
  };
}
