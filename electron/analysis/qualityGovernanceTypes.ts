/** Types of the quality budget, refactoring waves and the dashboard. */

import type { DecompositionCandidate, DecompositionGuidance } from './DecompositionGuidanceService';
import type { HealthScoreResult } from './HealthScoreAnalyzer';
import type { DetectedPattern } from './PatternDetectionAnalyzer';

/**
 * A score from 0 to 100 for one aspect of quality, its status and the reason the aspect is
 * measured.
 */
export interface QualityBudgetDimension {
  name: 'maintainability' | 'solid' | 'architecture' | 'operability';
  score: number;
  status: 'healthy' | 'warning' | 'critical';
  rationale: string;
}

/**
 * The overall quality verdict: an average score, a status, the policy for new changes and the
 * codes of the issues that block it.
 */
export interface QualityBudget {
  overallScore: number;
  overallStatus: 'healthy' | 'warning' | 'critical';
  recommendedPolicy: 'allow_targeted_changes' | 'refactor_before_growth' | 'freeze_growth';
  blockingIssueCodes: string[];
  dimensions: QualityBudgetDimension[];
}

/**
 * A step in a cleanup plan: the targets, the files involved, files from earlier waves that should
 * be done first, a priority and the criteria that say when the wave is done.
 */
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

/** One check of the dashboard: pass, warning or block, with the reason. */
export interface QualityGate {
  id: string;
  title: string;
  status: 'pass' | 'warning' | 'block';
  rationale: string;
}

/**
 * Overview for people and agents: the budget summary, the gates, the top blockers and the best
 * extraction candidates.
 */
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

/**
 * What the budget needs: the health result, the detected patterns and the decomposition guidance.
 */
export interface BuildQualityGovernanceInput {
  health: HealthScoreResult;
  patterns: DetectedPattern[];
  decompositionGuidance: DecompositionGuidance;
}
