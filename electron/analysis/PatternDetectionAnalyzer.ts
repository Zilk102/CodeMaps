import { GraphData } from '../store';
import {
  buildGraphAdjacency,
} from './graphAnalysisUtils';
import { ArchitectureInsightService } from './ArchitectureInsightService';
import { analyzeModuleQuality } from './moduleQualityMetrics';
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

export class PatternDetectionAnalyzer {
  constructor(private readonly architectureInsightService = new ArchitectureInsightService()) {}

  analyze(graph: GraphData): PatternDetectionResult {
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

    return { patterns };
  }
}
