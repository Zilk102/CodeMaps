/**
 * Shared helpers of the context services: telemetry access, optional security scanning and quality
 * artifacts.
 */
import { initialRefreshTelemetry } from '../store/telemetry';
import { GraphData, RefreshTelemetry } from '../store/types';
import { DecompositionGuidance } from './DecompositionGuidanceService';
import { HealthScoreResult } from './HealthScoreAnalyzer';
import { DetectedPattern } from './PatternDetectionAnalyzer';
import {
  QualityBudget,
  QualityDashboard,
  QualityGovernanceService,
  RefactoringWave,
} from './QualityGovernanceService';
import { SecurityScanResult, SecurityScanner } from './SecurityScanner';

export const EMPTY_SECURITY_SCAN_RESULT: SecurityScanResult = {
  findings: [],
  summary: {
    total: 0,
    critical: 0,
    high: 0,
    medium: 0,
    low: 0,
  },
};

/** Refresh telemetry of the graph, or the initial (empty) telemetry for a graph that has none. */
export const getOperationalTelemetry = (graph: GraphData): RefreshTelemetry =>
  graph.refreshTelemetry || initialRefreshTelemetry;

/**
 * Runs the security scanner unless `includeSecurityFindings` is explicitly false, in which case an
 * empty result is returned without scanning.
 */
export const resolveSecurityScan = async (
  graph: GraphData,
  includeSecurityFindings: boolean | undefined,
  securityScanner: SecurityScanner
): Promise<SecurityScanResult> => {
  if (includeSecurityFindings === false) {
    return EMPTY_SECURITY_SCAN_RESULT;
  }

  return securityScanner.analyze(graph);
};

/**
 * Builds the quality budget, the refactoring waves (up to `limitPerWave` targets each) and the
 * quality dashboard that ties both together.
 */
export const buildQualityArtifacts = (
  graph: GraphData,
  health: HealthScoreResult,
  patterns: DetectedPattern[],
  decompositionGuidance: DecompositionGuidance,
  qualityGovernanceService: QualityGovernanceService,
  limitPerWave = 4
): {
  qualityBudget: QualityBudget;
  refactoringWaves: RefactoringWave[];
  qualityDashboard: QualityDashboard;
} => {
  const qualityBudget = qualityGovernanceService.buildBudget({
    health,
    patterns,
    decompositionGuidance,
  });
  const refactoringWaves = qualityGovernanceService.buildRefactoringWaves(
    graph,
    decompositionGuidance,
    limitPerWave
  );
  const qualityDashboard = qualityGovernanceService.buildDashboard(
    qualityBudget,
    decompositionGuidance,
    refactoringWaves
  );

  return {
    qualityBudget,
    refactoringWaves,
    qualityDashboard,
  };
};
