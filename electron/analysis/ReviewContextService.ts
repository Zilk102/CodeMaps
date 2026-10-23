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
import {
  buildReviewAutopilotPlan,
  buildReviewNextSteps,
  buildReviewPriorities,
  hasRefreshPressure,
} from './reviewContextPolicies';
import {
  buildReviewSecurityView,
  normalizeReviewTaskMode,
  prepareReviewFocusContext,
  ReviewTaskMode,
} from './reviewContextSupport';

export type { ReviewTaskMode } from './reviewContextSupport';

export interface PrepareReviewContextInput {
  focusQuery?: string;
  type?: string;
  limit?: number;
  includeSecurityFindings?: boolean;
  includeClassifications?: boolean;
  taskMode?: ReviewTaskMode;
}

export interface ReviewPriority {
  severity: 'critical' | 'high' | 'medium' | 'low';
  title: string;
  reason: string;
  nodeIds: string[];
  evidence?: string[];
}

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

export class ReviewContextService {
  constructor(
    private readonly analysisSnapshotService = new AnalysisSnapshotService(),
    private readonly decompositionGuidanceService = new DecompositionGuidanceService(),
    private readonly qualityGovernanceService = new QualityGovernanceService()
  ) {}

  async prepareReviewContext(
    graph: GraphData,
    input: PrepareReviewContextInput
  ): Promise<ReviewContextResult> {
    const taskMode = normalizeReviewTaskMode(input.taskMode);
    const { architecture, health, patterns, security } = await this.analysisSnapshotService.analyze(
      graph,
      {
        includeHealth: true,
        includeSecurityFindings: input.includeSecurityFindings,
        patternLimit: input.limit || MAX_REVIEW_PATTERNS,
      }
    );
    const resolvedHealth = health!;
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

  private assembleResult(ctx: ReviewAssemblyContext): ReviewContextResult {
    const { graph, input, architecture, health, patterns, focus, decompositionGuidance } = ctx;
    const { qualityBudget, qualityDashboard, refactoringWaves } = ctx.quality;
    const limit = input.limit || MAX_REVIEW_PATTERNS;

    return {
      graphSummary: createGraphSummary(graph),
      taskMode: ctx.taskMode,
      health,
      architecture: {
        summary: architecture.summary,
        layers: architecture.layers,
        dependencies: architecture.dependencies.slice(0, limit),
        violations: architecture.violations.slice(0, limit),
        classifications: input.includeClassifications ? architecture.classifications : undefined,
      },
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
