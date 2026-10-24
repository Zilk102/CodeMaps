/**
 * Result assembly for the review context: turns gathered evidence into the ReviewContextResult,
 * adding priorities, the autopilot plan and next steps.
 */
import type { GraphData } from '../store/types';
import type { ArchitectureOverview } from './ArchitectureInsightService';
import { createGraphSummary } from './AgentContextUtils';
import { buildReviewAutopilotPlan } from './reviewAutopilotPlan';
import { MAX_REVIEW_PATTERNS, type ReviewEvidence } from './reviewContextEvidence';
import { buildReviewSecurityView, type ReviewTaskMode } from './reviewContextSupport';
import type { PrepareReviewContextInput, ReviewContextResult } from './reviewContextTypes';
import { buildReviewNextSteps } from './reviewNextSteps';
import { buildReviewPriorities } from './reviewPriorityPolicies';
import { hasRefreshPressure } from './reviewPriorityShared';

/** Everything assembly needs: the request, the normalized task mode and the gathered evidence. */
export interface ReviewAssemblyContext extends ReviewEvidence {
  graph: GraphData;
  input: PrepareReviewContextInput;
  taskMode: ReviewTaskMode;
}

/** The architecture section of the result: dependencies and violations are capped at the review limit. */
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

/** Builds the final review result; the evidence is only read, never re-analyzed. */
export function assembleReviewContextResult(ctx: ReviewAssemblyContext): ReviewContextResult {
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
