/**
 * Prepares the context for a code review or audit: health, architecture, patterns, security,
 * priorities, quality plan and next steps.
 */

import { GraphData, GraphNode } from '../store/types';
import {
  ArchitectureNodeClassification,
  ArchitectureOverview,
  ArchitectureViolation,
} from './ArchitectureInsightService';
import { HealthScoreResult } from './HealthScoreAnalyzer';
import { DetectedPattern } from './PatternDetectionAnalyzer';
import { SecurityFinding } from './SecurityScanner';
import {
  DecompositionGuidance,
  DecompositionGuidanceService,
} from './DecompositionGuidanceService';
import {
  QualityBudget,
  QualityDashboard,
  QualityGovernanceService,
  RefactoringWave,
} from './QualityGovernanceService';
import { createGraphSummary } from './AgentContextUtils';
import { buildQualityArtifacts } from './contextSupport';
import { AnalysisSnapshotService } from './AnalysisSnapshotService';
import { buildReviewAutopilotPlan } from './reviewAutopilotPlan';
import { buildReviewNextSteps } from './reviewNextSteps';
import { buildReviewPriorities } from './reviewPriorityPolicies';
import { hasRefreshPressure } from './reviewPriorityShared';
import {
  buildReviewSecurityView,
  normalizeReviewTaskMode,
  prepareReviewFocusContext,
  ReviewTaskMode,
} from './reviewContextSupport';

export type { ReviewTaskMode } from './reviewContextSupport';

/**
 * Options for a review context: an optional focus query (and node type) to look closer at one
 * area, a list size limit, and flags for security findings and per-node classifications.
 */
export interface PrepareReviewContextInput {
  focusQuery?: string;
  type?: string;
  limit?: number;
  includeSecurityFindings?: boolean;
  includeClassifications?: boolean;
  taskMode?: ReviewTaskMode;
}

/**
 * One thing to look at first in a review: how severe it is, why, the nodes involved and optional
 * evidence.
 */
export interface ReviewPriority {
  severity: 'critical' | 'high' | 'medium' | 'low';
  title: string;
  reason: string;
  nodeIds: string[];
  evidence?: string[];
}

/**
 * The review context for the agent. `focus` is null without a focus query; `reviewPriorities` is
 * the ordered list of what to inspect first.
 */
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

const MAX_REVIEW_PATTERNS = 12;

interface ReviewAssemblyContext {
  graph: GraphData;
  input: PrepareReviewContextInput;
  taskMode: ReviewTaskMode;
  architecture: ArchitectureOverview;
  health: HealthScoreResult;
  patterns: DetectedPattern[];
  securityFindings: SecurityFinding[];
  focus: ReviewContextResult['focus'];
  decompositionGuidance: DecompositionGuidance;
  quality: ReturnType<typeof buildQualityArtifacts>;
}

/**
 * Architecture part of the review: summary and layers, the first `limit` dependencies and
 * violations, and classifications only when requested.
 */
const buildArchitectureView = (
  architecture: ArchitectureOverview,
  limit: number,
  includeClassifications?: boolean
): ReviewContextResult['architecture'] => ({
  summary: architecture.summary,
  layers: architecture.layers,
  dependencies: architecture.dependencies.slice(0, limit),
  violations: architecture.violations.slice(0, limit),
  classifications: includeClassifications ? architecture.classifications : undefined,
});

/**
 * Orchestrates a review: runs the analysis snapshot, resolves the focus area, computes
 * decomposition guidance and quality artifacts, and assembles them into priorities, a plan and
 * next steps.
 */
export class ReviewContextService {
  constructor(
    private readonly analysisSnapshotService: AnalysisSnapshotService = new AnalysisSnapshotService(),
    private readonly decompositionGuidanceService: DecompositionGuidanceService = new DecompositionGuidanceService(),
    private readonly qualityGovernanceService: QualityGovernanceService = new QualityGovernanceService()
  ) {}

  /**
   * Builds the review context for a graph. Lists are limited to `limit` entries (default 12); an
   * unknown task mode is treated as 'review'.
   */
  async prepareReviewContext(
    graph: GraphData,
    input: PrepareReviewContextInput
  ): Promise<ReviewContextResult> {
    const taskMode = normalizeReviewTaskMode(input.taskMode);
    const {
      architecture,
      health: resolvedHealth,
      patterns,
      security,
    } = await this.analysisSnapshotService.analyzeWithHealth(
      graph,
      input.includeSecurityFindings,
      input.limit || MAX_REVIEW_PATTERNS
    );
    const focus = prepareReviewFocusContext(
      graph,
      architecture,
      patterns,
      input.focusQuery,
      input.type
    );
    const decompositionGuidance = this.decompositionGuidanceService.prepareGuidance(graph, {
      limit: input.limit || MAX_REVIEW_PATTERNS,
      focusNodeIds: focus?.matches.map((node) => node.id),
    });
    const quality = buildQualityArtifacts(
      graph,
      resolvedHealth,
      patterns,
      decompositionGuidance,
      this.qualityGovernanceService,
      4
    );

    return this.assembleResult({
      graph,
      input,
      taskMode,
      architecture,
      health: resolvedHealth,
      patterns,
      securityFindings: security.findings,
      focus,
      decompositionGuidance,
      quality,
    });
  }

  /**
   * Combines the analysis results into the final response, adding the priorities, the autopilot
   * plan and the next steps.
   */
  private assembleResult(ctx: ReviewAssemblyContext): ReviewContextResult {
    const { graph, input, architecture, health, patterns, focus, decompositionGuidance } = ctx;
    const { qualityBudget, qualityDashboard, refactoringWaves } = ctx.quality;
    const limit = input.limit || MAX_REVIEW_PATTERNS;

    return {
      graphSummary: createGraphSummary(graph),
      taskMode: ctx.taskMode,
      health,
      architecture: buildArchitectureView(architecture, limit, input.includeClassifications),
      patterns,
      security: buildReviewSecurityView(ctx.securityFindings),
      focus,
      qualityBudget,
      qualityDashboard,
      decompositionGuidance,
      refactoringWaves,
      reviewPriorities: buildReviewPriorities(
        graph,
        health,
        architecture,
        patterns,
        ctx.securityFindings,
        focus,
        decompositionGuidance,
        qualityBudget
      ),
      autopilotPlan: buildReviewAutopilotPlan(
        ctx.taskMode,
        ctx.securityFindings,
        architecture,
        focus,
        health.summary.stackAwareLinks > 0,
        hasRefreshPressure(health)
      ),
      nextSteps: buildReviewNextSteps(
        health,
        architecture,
        patterns,
        ctx.securityFindings,
        Boolean(focus),
        decompositionGuidance
      ),
    };
  }
}
