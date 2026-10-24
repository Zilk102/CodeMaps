/**
 * Entry point of pattern detection: combines structural, quality and runtime detectors into one
 * result.
 */

import { GraphData } from '../store/types';
import { buildGraphAdjacency } from './graphAnalysisUtils';
import type { ArchitectureInsightService } from './ArchitectureInsightService';
import { analyzeModuleQuality } from './moduleQualityMetrics';
import {
  buildQualityPatterns,
  buildRuntimePatterns,
  buildStructuralPatterns,
} from './patternDetectionPolicies';
import {
  createPatternDetectionServices,
  type PatternDetectionServices,
} from './patternDetectionServices';
import type { PatternDetectionResult, PatternDetectionSources } from './patternDetectionTypes';
export type {
  DetectedPattern,
  PatternDetectionResult,
  PatternEvidence,
} from './patternDetectionTypes';

/**
 * Detects architectural and code quality patterns (hubs, god files, violations, clones and
 * similar) in a graph.
 */
export class PatternDetectionAnalyzer {
  private readonly services: PatternDetectionServices;

  constructor(architectureInsightService?: ArchitectureInsightService) {
    this.services = createPatternDetectionServices(
      architectureInsightService ? { architectureInsightService } : {}
    );
  }

  /**
   * Runs the architecture and module quality analyses once and feeds them to the structural,
   * quality and runtime detectors. Returns all detected patterns in that detector order.
   */
  analyze(graph: GraphData): PatternDetectionResult {
    return { patterns: this.analyzeWithSources(graph).patterns };
  }

  /**
   * Same detection as `analyze`, but also returns the quality and architecture analyses it ran, so
   * a caller that needs them (change validation) does not compute them a second time.
   */
  analyzeWithSources(graph: GraphData): PatternDetectionSources {
    const architecture = this.services.architectureInsightService.analyze(graph);
    const quality = analyzeModuleQuality(graph);
    const { nodeById, incomingByTarget, outgoingBySource, childrenByParentId } =
      buildGraphAdjacency(graph);
    const patterns = [
      ...buildStructuralPatterns({
        graph,
        architecture,
        incomingByTarget,
        outgoingBySource,
        nodeById,
        childrenByParentId,
      }),
      ...buildQualityPatterns(quality),
      ...buildRuntimePatterns({
        graph,
        incomingByTarget,
        outgoingBySource,
      }),
    ];

    return { patterns, quality, architecture };
  }
}
