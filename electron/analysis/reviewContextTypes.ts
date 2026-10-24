/**
 * Public contracts of the review context: the tool input, the prioritized findings and the full
 * result handed to agents. Kept apart from the service so policies can import them without
 * depending on the orchestration.
 */
import type { GraphNode } from '../store/types';
import type {
  ArchitectureNodeClassification,
  ArchitectureOverview,
  ArchitectureViolation,
} from './ArchitectureInsightService';
import type { DecompositionGuidance } from './DecompositionGuidanceService';
import type { HealthScoreResult } from './HealthScoreAnalyzer';
import type { DetectedPattern } from './PatternDetectionAnalyzer';
import type { QualityBudget, QualityDashboard, RefactoringWave } from './QualityGovernanceService';
import type { ReviewTaskMode } from './reviewContextSupport';
import type { SecurityFinding } from './SecurityScanner';

/** Arguments of `prepareReviewContext`; every field is optional and defaults to a whole-project review. */
export interface PrepareReviewContextInput {
  focusQuery?: string;
  type?: string;
  limit?: number;
  includeSecurityFindings?: boolean;
  includeClassifications?: boolean;
  taskMode?: ReviewTaskMode;
}

/** One ranked item of the review: what to look at first and the evidence behind it. */
export interface ReviewPriority {
  severity: 'critical' | 'high' | 'medium' | 'low';
  title: string;
  reason: string;
  nodeIds: string[];
  evidence?: string[];
}

/** Everything an agent needs to start a review: analyses, ranked priorities, quality artifacts and a plan. */
export interface ReviewContextResult {
  graphSummary: {
    projectRoot: string;
    nodesCount: number;
    linksCount: number;
    nodeTypes: Record<string, number>;
  };
  taskMode: ReviewTaskMode;
  health: HealthScoreResult;
  architecture: {
    summary: ArchitectureOverview['summary'];
    layers: ArchitectureOverview['layers'];
    dependencies: ArchitectureOverview['dependencies'];
    violations: ArchitectureOverview['violations'];
    classifications?: ArchitectureOverview['classifications'];
  };
  patterns: DetectedPattern[];
  security: {
    summary: {
      total: number;
      critical: number;
      high: number;
      medium: number;
      low: number;
    };
    findings: SecurityFinding[];
  };
  focus: null | {
    query: string;
    matches: GraphNode[];
    classifications: ArchitectureNodeClassification[];
    relatedPatterns: DetectedPattern[];
    relatedViolations: ArchitectureViolation[];
  };
  reviewPriorities: ReviewPriority[];
  qualityBudget: QualityBudget;
  qualityDashboard: QualityDashboard;
  decompositionGuidance: DecompositionGuidance;
  refactoringWaves: RefactoringWave[];
  autopilotPlan: {
    primaryGoal: string;
    preferredOrder: Array<'security' | 'architecture' | 'patterns' | 'health' | 'focused_area'>;
    shouldFallbackToLowLevelTools: boolean;
  };
  nextSteps: string[];
}
