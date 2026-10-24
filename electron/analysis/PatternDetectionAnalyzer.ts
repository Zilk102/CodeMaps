/**
 * Entry point of pattern detection: combines structural, quality and runtime detectors into one
 * result.
 */

import { GraphData } from '../store/types';
import { buildGraphAdjacency } from './graphAnalysisUtils';
import { ArchitectureInsightService } from './ArchitectureInsightService';
import type { ArchitectureOverview } from './architectureTypes';
import { analyzeModuleQuality, type ModuleQualitySummary } from './moduleQualityMetrics';
import {
  buildQualityPatterns,
  buildRuntimePatterns,
  buildStructuralPatterns,
} from './patternDetectionPolicies';
import type { PatternDetectionResult } from './patternDetectionTypes';
export type {
  DetectedPattern,
  PatternDetectionResult,
  PatternEvidence,
} from './patternDetectionTypes';

/** The patterns together with the analyses they were derived from, for callers that need both. */
export interface PatternDetectionSources extends PatternDetectionResult {
  quality: ModuleQualitySummary;
  architecture: ArchitectureOverview;
}

/**
 * Detects architectural and code quality patterns (hubs, god files, violations, clones and
 * similar) in a graph.
 */
export class PatternDetectionAnalyzer {
  constructor(private readonly architectureInsightService = new ArchitectureInsightService()) {}

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
    const architecture = this.architectureInsightService.analyze(graph);
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
