/**
 * Public entry point for preparing the review context of a project; re-exports its input and
 * result types.
 */
import type { GraphData } from '../store/types';
import { AnalysisSnapshotService } from './AnalysisSnapshotService';
import { DecompositionGuidanceService } from './DecompositionGuidanceService';
import { QualityGovernanceService } from './QualityGovernanceService';
import { assembleReviewContextResult } from './reviewContextAssembly';
import { collectReviewEvidence } from './reviewContextEvidence';
import { normalizeReviewTaskMode } from './reviewContextSupport';
import {
  createReviewContextServicesFrom,
  type ReviewContextServices,
} from './reviewContextServices';
import type { PrepareReviewContextInput, ReviewContextResult } from './reviewContextTypes';

export type { ReviewTaskMode } from './reviewContextSupport';
export type {
  PrepareReviewContextInput,
  ReviewContextResult,
  ReviewPriority,
} from './reviewContextTypes';

/** Orchestrates evidence gathering and result assembly for one review. */
export class ReviewContextService {
  private readonly services: ReviewContextServices;

  constructor(
    analysisSnapshotService?: AnalysisSnapshotService,
    decompositionGuidanceService?: DecompositionGuidanceService,
    qualityGovernanceService?: QualityGovernanceService
  ) {
    this.services = createReviewContextServicesFrom(
      analysisSnapshotService,
      decompositionGuidanceService,
      qualityGovernanceService
    );
  }

  /**
   * Analyzes the graph (architecture, health, patterns, security), resolves the optional focus
   * area, and assembles the prioritized review result. Task mode falls back to 'review'.
   */
  async prepareReviewContext(
    graph: GraphData,
    input: PrepareReviewContextInput
  ): Promise<ReviewContextResult> {
    const taskMode = normalizeReviewTaskMode(input.taskMode);
    const evidence = await collectReviewEvidence(this.services, graph, input);
    return assembleReviewContextResult({ graph, input, taskMode, ...evidence });
  }
}
