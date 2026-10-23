import { GraphData } from '../store/types';
import { ArchitectureOverview } from './ArchitectureInsightService';
import { DetectedPattern } from './PatternDetectionAnalyzer';
import { HealthScoreResult } from './HealthScoreAnalyzer';
import { StackInsightService } from './StackInsightService';
import { StackTopologyService } from './StackTopologyService';
import {
  DecompositionGuidance,
  DecompositionGuidanceService,
} from './DecompositionGuidanceService';
import { QualityGovernanceService } from './QualityGovernanceService';
import type { PrepareProjectContextInput, ProjectInsightResult } from './projectInsightTypes';
import { buildQualityArtifacts, getOperationalTelemetry } from './contextSupport';
import { AnalysisSnapshotService } from './AnalysisSnapshotService';
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

export type { PrepareProjectContextInput, ProjectInsightResult } from './projectInsightTypes';

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

export class ProjectInsightService {
  constructor(
    private readonly analysisSnapshotService = new AnalysisSnapshotService(),
    private readonly stackInsightService = new StackInsightService(),
    private readonly stackTopologyService = new StackTopologyService(),
    private readonly decompositionGuidanceService = new DecompositionGuidanceService(),
    private readonly qualityGovernanceService = new QualityGovernanceService()
  ) {}

  async prepareContext(
    graph: GraphData,
    input: PrepareProjectContextInput = {}
  ): Promise<ProjectInsightResult> {
    const limit = resolveProjectInsightLimit(input.limit);
    const { architecture, health, patterns, security } = await this.analysisSnapshotService.analyze(
      graph,
      {
        includeHealth: true,
        includeSecurityFindings: input.includeSecurityFindings,
        patternLimit: limit,
      }
    );
    const resolvedHealth = health!;
    const stackProfile = await this.stackInsightService.analyze(graph);
    const stackTopology = await this.stackTopologyService.analyze(graph, stackProfile);
    const decompositionGuidance = this.decompositionGuidanceService.prepareGuidance(graph, {
      limit,
    });

    return this.assembleResult({
      graph,
      input,
      limit,
      architecture,
      health: resolvedHealth,
      patterns,
      security,
      mentalModel: buildProjectMentalModel(graph, architecture),
      stackProfile,
      stackTopology,
      decompositionGuidance,
      quality: buildQualityArtifacts(
        graph,
        resolvedHealth,
        patterns,
        decompositionGuidance,
        this.qualityGovernanceService,
        4
      ),
    });
  }

  private assembleResult(ctx: ProjectAssemblyContext): ProjectInsightResult {
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
        (budget) => this.qualityGovernanceService.summarizeBudgetForStep(budget)
      ),
    };
  }
}
