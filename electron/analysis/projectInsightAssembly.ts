/** Runs the analyses behind a project overview and folds them into one result. */

import { GraphData } from '../store/types';
import { ArchitectureOverview } from './ArchitectureInsightService';
import { DetectedPattern } from './PatternDetectionAnalyzer';
import { HealthScoreResult } from './HealthScoreAnalyzer';
import { DecompositionGuidance } from './DecompositionGuidanceService';
import type { StackInsightService } from './StackInsightService';
import type { StackTopologyService } from './StackTopologyService';
import type { AnalysisSnapshotService } from './AnalysisSnapshotService';
import type { PrepareProjectContextInput, ProjectInsightResult } from './projectInsightTypes';
import type { ProjectInsightServices } from './projectInsightServices';
import { buildQualityArtifacts, getOperationalTelemetry } from './contextSupport';
import { createGraphSummary } from './AgentContextUtils';
import { buildProjectMentalModel } from './projectInsightMentalModel';
import {
  buildProjectAutopilotPlan,
  buildProjectNextSteps,
  buildProjectProfile,
} from './projectInsightNarrative';
import {
  buildProjectArchitectureView,
  buildProjectSecurityView,
  resolveProjectInsightLimit,
} from './projectInsightSupport';

interface ProjectAssemblyContext {
  graph: GraphData;
  input: PrepareProjectContextInput;
  limit: number;
  architecture: ArchitectureOverview;
  health: HealthScoreResult;
  patterns: DetectedPattern[];
  security: Awaited<ReturnType<AnalysisSnapshotService['analyze']>>['security'];
  mentalModel: ProjectInsightResult['mentalModel'];
  stackProfile: Awaited<ReturnType<StackInsightService['analyze']>>;
  stackTopology: Awaited<ReturnType<StackTopologyService['analyze']>>;
  decompositionGuidance: DecompositionGuidance;
  quality: ReturnType<typeof buildQualityArtifacts>;
}

/** Runs the analyses a project insight is made of. */
export async function collectProjectAssemblyContext(
  services: ProjectInsightServices,
  graph: GraphData,
  input: PrepareProjectContextInput
): Promise<ProjectAssemblyContext> {
  const limit = resolveProjectInsightLimit(input.limit);
  const { architecture, health, patterns, security } =
    await services.analysisSnapshot.analyzeWithHealth(graph, input.includeSecurityFindings, limit);
  const stackProfile = await services.stackInsight.analyze(graph);
  const stackTopology = await services.stackTopology.analyze(graph, stackProfile);
  const decompositionGuidance = services.decompositionGuidance.prepareGuidance(graph, { limit });

  return {
    graph,
    input,
    limit,
    architecture,
    health,
    patterns,
    security,
    mentalModel: buildProjectMentalModel(graph, architecture),
    stackProfile,
    stackTopology,
    decompositionGuidance,
    quality: buildQualityArtifacts(
      graph,
      health,
      patterns,
      decompositionGuidance,
      services.qualityGovernance,
      4
    ),
  };
}

/** Folds the analyses into the project insight result. */
export function assembleProjectResult(
  ctx: ProjectAssemblyContext,
  services: ProjectInsightServices
): ProjectInsightResult {
  const { graph, input, limit, architecture, health, patterns, security, mentalModel } = ctx;
  const { decompositionGuidance } = ctx;
  const { qualityBudget, qualityDashboard, refactoringWaves } = ctx.quality;
  const operationalTelemetry = getOperationalTelemetry(graph);

  return {
    graphSummary: createGraphSummary(graph),
    projectProfile: buildProjectProfile(
      graph,
      architecture,
      health,
      ctx.stackProfile,
      ctx.stackTopology
    ),
    architecture: buildProjectArchitectureView(architecture, input.includeClassifications, limit),
    health,
    operationalTelemetry,
    patterns,
    security: buildProjectSecurityView(security.findings, security.summary),
    mentalModel,
    autopilotPlan: buildProjectAutopilotPlan(architecture, health, patterns, mentalModel),
    qualityBudget,
    qualityDashboard,
    decompositionGuidance,
    refactoringWaves,
    nextSteps: buildProjectNextSteps(
      health,
      architecture,
      patterns,
      security.findings,
      mentalModel,
      operationalTelemetry,
      decompositionGuidance,
      qualityBudget,
      refactoringWaves,
      (budget) => services.qualityGovernance.summarizeBudgetForStep(budget)
    ),
  };
}
