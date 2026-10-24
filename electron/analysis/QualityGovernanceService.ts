/**
 * Facade over the quality governance policies: quality budget, refactoring waves and the gate
 * dashboard.
 */

import { GraphData } from '../store/types';
import { DecompositionGuidance } from './DecompositionGuidanceService';
import {
  buildQualityBudget,
  buildQualityDashboard,
  buildRefactoringWaves,
  summarizeBudgetForStep,
} from './qualityGovernancePolicies';
import type {
  BuildQualityGovernanceInput,
  QualityBudget,
  QualityDashboard,
  RefactoringWave,
} from './qualityGovernanceTypes';
export type {
  BuildQualityGovernanceInput,
  QualityBudget,
  QualityBudgetDimension,
  QualityDashboard,
  QualityGate,
  RefactoringWave,
} from './qualityGovernanceTypes';

/**
 * Applies quality governance to a project: it judges how much change the code base can take
 * (budget), orders the cleanup (waves) and summarizes the gates (dashboard).
 */
export class QualityGovernanceService {
  /**
   * Scores four dimensions (maintainability, SOLID, architecture, operability) from health and
   * patterns and recommends a policy for new changes.
   */
  buildBudget(input: BuildQualityGovernanceInput): QualityBudget {
    return buildQualityBudget(input);
  }

  /**
   * Groups decomposition candidates into ordered cleanup waves (boundaries, classes, methods), at
   * most `limitPerWave` targets each; waves without candidates are omitted.
   */
  buildRefactoringWaves(
    graph: GraphData,
    decompositionGuidance: DecompositionGuidance,
    limitPerWave = 5
  ): RefactoringWave[] {
    return buildRefactoringWaves(graph, decompositionGuidance, limitPerWave);
  }

  /**
   * Builds the dashboard of pass, warning and block gates from the budget, the extraction
   * candidates and the first wave.
   */
  buildDashboard(
    budget: QualityBudget,
    decompositionGuidance: DecompositionGuidance,
    refactoringWaves: RefactoringWave[]
  ): QualityDashboard {
    return buildQualityDashboard(budget, decompositionGuidance, refactoringWaves);
  }

  /** One-sentence advice for the next-steps list, based on the budget's recommended policy. */
  summarizeBudgetForStep(budget: QualityBudget) {
    return summarizeBudgetForStep(budget);
  }
}
