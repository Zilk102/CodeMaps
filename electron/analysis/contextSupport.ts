import { initialRefreshTelemetry } from '../store/telemetry';
import { GraphData, RefreshTelemetry } from '../store';
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

export const getOperationalTelemetry = (graph: GraphData): RefreshTelemetry =>
  graph.refreshTelemetry || initialRefreshTelemetry;

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
