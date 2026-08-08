import { GraphData } from '../store';
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

export class QualityGovernanceService {
  buildBudget(input: BuildQualityGovernanceInput): QualityBudget {
    return buildQualityBudget(input);
  }

  buildRefactoringWaves(
    graph: GraphData,
    decompositionGuidance: DecompositionGuidance,
    limitPerWave = 5
  ): RefactoringWave[] {
    return buildRefactoringWaves(graph, decompositionGuidance, limitPerWave);
  }

  buildDashboard(
    budget: QualityBudget,
    decompositionGuidance: DecompositionGuidance,
    refactoringWaves: RefactoringWave[]
  ): QualityDashboard {
    return buildQualityDashboard(budget, decompositionGuidance, refactoringWaves);
  }

  summarizeBudgetForStep(budget: QualityBudget) {
    return summarizeBudgetForStep(budget);
  }
}
