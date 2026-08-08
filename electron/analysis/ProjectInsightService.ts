import { GraphData, GraphNode } from '../store';
import { ArchitectureOverview } from './ArchitectureInsightService';
import { DetectedPattern } from './PatternDetectionAnalyzer';
import { HealthScoreResult } from './HealthScoreAnalyzer';
import { DetectedStack, StackInsightService } from './StackInsightService';
import { StackStructuralInsight, StackTopologyService } from './StackTopologyService';
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

export interface PrepareProjectContextInput {
  includeSecurityFindings?: boolean;
  includeClassifications?: boolean;
  limit?: number;
}

export interface ProjectInsightResult {
  graphSummary: {
    projectRoot: string;
    nodesCount: number;
    linksCount: number;
    nodeTypes: Record<string, number>;
  };
  projectProfile: {
    primaryTechnologies: Array<{ name: string; fileCount: number }>;
    languageSupportSummary: Array<{
      id: string;
      displayName: string;
      supportTier: 'semantic' | 'structural' | 'limited' | 'metadata';
      fileCount: number;
    }>;
    stackProfile: {
      packageManagers: DetectedStack[];
      buildSystems: DetectedStack[];
      frameworks: DetectedStack[];
    };
    stackTopology: {
      frameworkInsights: StackStructuralInsight[];
      buildInsights: StackStructuralInsight[];
    };
    projectShape: string;
    architectureMaturity: 'strong' | 'fair' | 'weak';
  };
  architecture: {
    summary: ArchitectureOverview['summary'];
    layers: ArchitectureOverview['layers'];
    dependencies: ArchitectureOverview['dependencies'];
    classifications?: ArchitectureOverview['classifications'];
  };
  health: HealthScoreResult;
  operationalTelemetry: {
    watcher: {
      flushCount: number;
      batchedEventCount: number;
      coalescedFlushes: number;
      maxBatchSize: number;
      lastBatchSize: number;
      lastEvent: 'add' | 'change' | 'unlink' | 'addDir' | 'unlinkDir' | null;
      recentBatchSizes: number[];
    };
    enrichment: {
      skippedRefreshes: number;
      rebuiltRefreshes: number;
      runtimePriorityRebuilds: number;
      directoryTriggeredRebuilds: number;
      avgRefreshLatencyMs: number;
      lastRefreshMode: 'skipped' | 'rebuilt' | null;
      lastRefreshReason:
        | 'no_stack_impact'
        | 'directory_structure_changed'
        | 'stack_runtime_path_changed'
        | null;
      recentLatencyMs: number[];
      recentModes: Array<'skipped' | 'rebuilt'>;
    };
    trends: {
      watcher: {
        coalescingRatio: number;
        batchSizeTrend: 'stable' | 'improving' | 'degrading';
      };
      enrichment: {
        skipRate: number;
        runtimePriorityRate: number;
        latencyTrend: 'stable' | 'improving' | 'degrading';
        degraded: boolean;
      };
    };
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
  mentalModel: {
    entryPoints: GraphNode[];
    coreOrchestrators: GraphNode[];
    runtimeCompositionRoots: GraphNode[];
    contractSurfaces: GraphNode[];
    sharedFoundations: GraphNode[];
    keyBoundaries: string[];
    likelyWorkflows: string[];
  };
  autopilotPlan: {
    primaryGoal: string;
    preferredSequence: Array<
      | 'survey_project'
      | 'review_architecture'
      | 'inspect_hotspots'
      | 'prepare_change'
      | 'prepare_review'
    >;
    recommendedStartingNodes: string[];
    shouldFallbackToLowLevelTools: boolean;
  };
  qualityBudget: QualityBudget;
  qualityDashboard: QualityDashboard;
  decompositionGuidance: DecompositionGuidance;
  refactoringWaves: RefactoringWave[];
  nextSteps: string[];
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
    const mentalModel = buildProjectMentalModel(graph, architecture);
    const stackProfile = await this.stackInsightService.analyze(graph);
    const stackTopology = await this.stackTopologyService.analyze(graph, stackProfile);
    const decompositionGuidance = this.decompositionGuidanceService.prepareGuidance(graph, {
      limit,
    });
    const { qualityBudget, qualityDashboard, refactoringWaves } = buildQualityArtifacts(
      graph,
      resolvedHealth,
      patterns,
      decompositionGuidance,
      this.qualityGovernanceService,
      4
    );
    const operationalTelemetry = getOperationalTelemetry(graph);

    return {
      graphSummary: createGraphSummary(graph),
      projectProfile: buildProjectProfile(
        graph,
        architecture,
        resolvedHealth,
        stackProfile,
        stackTopology
      ),
      architecture: buildProjectArchitectureView(architecture, input.includeClassifications, limit),
      health: resolvedHealth,
      operationalTelemetry,
      patterns,
      security: buildProjectSecurityView(security.findings, security.summary),
      mentalModel,
      autopilotPlan: buildProjectAutopilotPlan(architecture, resolvedHealth, patterns, mentalModel),
      qualityBudget,
      qualityDashboard,
      decompositionGuidance,
      refactoringWaves,
      nextSteps: buildProjectNextSteps(
        resolvedHealth,
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
