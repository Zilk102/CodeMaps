import type { DecompositionCandidate, DecompositionGuidance } from './DecompositionGuidanceService';
import type { HealthScoreResult } from './HealthScoreAnalyzer';
import type { DetectedPattern } from './PatternDetectionAnalyzer';

export interface QualityBudgetDimension {
  name: 'maintainability' | 'solid' | 'architecture' | 'operability';
  score: number;
  status: 'healthy' | 'warning' | 'critical';
  rationale: string;
}

export interface QualityBudget {
  overallScore: number;
  overallStatus: 'healthy' | 'warning' | 'critical';
  recommendedPolicy: 'allow_targeted_changes' | 'refactor_before_growth' | 'freeze_growth';
  blockingIssueCodes: string[];
  dimensions: QualityBudgetDimension[];
}

export interface RefactoringWave {
  id: string;
  title: string;
  goal: string;
  candidateIds: string[];
  targetLabels: string[];
  fileIds: string[];
  blockingFileIds: string[];
  priorityScore: number;
  exitCriteria: string[];
}

export interface QualityGate {
  id: string;
  title: string;
  status: 'pass' | 'warning' | 'block';
  rationale: string;
}

export interface QualityDashboard {
  summary: {
    overallScore: number;
    overallStatus: QualityBudget['overallStatus'];
    recommendedPolicy: QualityBudget['recommendedPolicy'];
  };
  gates: QualityGate[];
  topBlockers: string[];
  focusCandidates: Array<{
    targetLabel: string;
    action: DecompositionCandidate['action'];
    priority: DecompositionCandidate['priority'];
    score: number;
  }>;
}

export interface BuildQualityGovernanceInput {
  health: HealthScoreResult;
  patterns: DetectedPattern[];
  decompositionGuidance: DecompositionGuidance;
}
