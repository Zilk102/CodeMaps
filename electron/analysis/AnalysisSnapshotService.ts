/**
 * Builds the combined architecture, health, pattern and security snapshot that the agent context
 * services start from.
 */
import { GraphData } from '../store/types';
import { ArchitectureInsightService, ArchitectureOverview } from './ArchitectureInsightService';
import { resolveSecurityScan } from './contextSupport';
import { HealthScoreAnalyzer, HealthScoreResult } from './HealthScoreAnalyzer';
import { DetectedPattern, PatternDetectionAnalyzer } from './PatternDetectionAnalyzer';
import { SecurityScanResult, SecurityScanner } from './SecurityScanner';

/**
 * Options for a snapshot. Health defaults to on, pattern list is unlimited unless `patternLimit`
 * is set, security findings follow `includeSecurityFindings`.
 */
export interface PrepareAnalysisSnapshotInput {
  includeHealth?: boolean;
  includeSecurityFindings?: boolean;
  patternLimit?: number;
}

/** The assembled snapshot; `health` is absent when the caller turned it off. */
export interface AnalysisSnapshotResult {
  architecture: ArchitectureOverview;
  health?: HealthScoreResult;
  patterns: DetectedPattern[];
  security: SecurityScanResult;
}

/**
 * Runs the four analyzers over one graph and returns their results together, so context services
 * do not repeat that wiring.
 */
export class AnalysisSnapshotService {
  constructor(
    private readonly architectureInsightService = new ArchitectureInsightService(),
    private readonly healthScoreAnalyzer = new HealthScoreAnalyzer(),
    private readonly patternDetectionAnalyzer = new PatternDetectionAnalyzer(),
    private readonly securityScanner = new SecurityScanner()
  ) {}

  /**
   * Analyzes the graph. Patterns are truncated to `patternLimit` when given; health is skipped
   * only when `includeHealth` is explicitly false; the security scan runs through
   * `resolveSecurityScan`.
   */
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

  /** The snapshot the context services build on: always with the health score. */
  async analyzeWithHealth(
    graph: GraphData,
    includeSecurityFindings: boolean | undefined,
    patternLimit: number
  ): Promise<AnalysisSnapshotResult & { health: HealthScoreResult }> {
    const snapshot = await this.analyze(graph, {
      includeHealth: true,
      includeSecurityFindings,
      patternLimit,
    });
    return { ...snapshot, health: snapshot.health! };
  }
}
