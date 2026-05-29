import { GraphData } from '../store';
import { ArchitectureInsightService, ArchitectureOverview } from './ArchitectureInsightService';
import { resolveSecurityScan } from './contextSupport';
import { HealthScoreAnalyzer, HealthScoreResult } from './HealthScoreAnalyzer';
import { DetectedPattern, PatternDetectionAnalyzer } from './PatternDetectionAnalyzer';
import { SecurityScanResult, SecurityScanner } from './SecurityScanner';

export interface PrepareAnalysisSnapshotInput {
  includeHealth?: boolean;
  includeSecurityFindings?: boolean;
  patternLimit?: number;
}

export interface AnalysisSnapshotResult {
  architecture: ArchitectureOverview;
  health?: HealthScoreResult;
  patterns: DetectedPattern[];
  security: SecurityScanResult;
}

export class AnalysisSnapshotService {
  constructor(
    private readonly architectureInsightService = new ArchitectureInsightService(),
    private readonly healthScoreAnalyzer = new HealthScoreAnalyzer(),
    private readonly patternDetectionAnalyzer = new PatternDetectionAnalyzer(),
    private readonly securityScanner = new SecurityScanner()
  ) {}

  async analyze(
    graph: GraphData,
    input: PrepareAnalysisSnapshotInput = {}
  ): Promise<AnalysisSnapshotResult> {
    const architecture = this.architectureInsightService.analyze(graph);
    const patterns = this.patternDetectionAnalyzer.analyze(graph).patterns;
    const limitedPatterns =
      typeof input.patternLimit === 'number' ? patterns.slice(0, input.patternLimit) : patterns;

    return {
      architecture,
      health: input.includeHealth === false ? undefined : this.healthScoreAnalyzer.analyze(graph),
      patterns: limitedPatterns,
      security: await resolveSecurityScan(
        graph,
        input.includeSecurityFindings,
        this.securityScanner
      ),
    };
  }
}
