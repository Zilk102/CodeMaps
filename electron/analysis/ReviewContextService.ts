import { GraphData, GraphNode } from '../store';
import {
  ArchitectureNodeClassification,
  ArchitectureOverview,
  ArchitectureViolation,
} from './ArchitectureInsightService';
import { HealthScoreResult } from './HealthScoreAnalyzer';
import { DetectedPattern } from './PatternDetectionAnalyzer';
import { SecurityFinding } from './SecurityScanner';
import { DecompositionGuidance, DecompositionGuidanceService } from './DecompositionGuidanceService';
import { QualityBudget, QualityDashboard, QualityGovernanceService, RefactoringWave } from './QualityGovernanceService';
import {
  createGraphSummary,
  promoteCodeTarget,
  searchGraph,
  toStructuralNodeId,
} from './AgentContextUtils';
import { buildQualityArtifacts } from './contextSupport';
import { AnalysisSnapshotService } from './AnalysisSnapshotService';
import {
  buildReviewAutopilotPlan,
  buildReviewNextSteps,
  buildReviewPriorities,
} from './reviewContextPolicies';

export type ReviewTaskMode = 'review' | 'architecture' | 'security' | 'stabilization';

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

const MAX_ALTERNATIVES = 5;
const MAX_REVIEW_PATTERNS = 12;
const MAX_REVIEW_FINDINGS = 20;
const REVIEW_TASK_MODES: ReviewTaskMode[] = ['review', 'architecture', 'security', 'stabilization'];

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
    const taskMode = this.normalizeReviewTaskMode(input.taskMode);
    const { architecture, health, patterns, security } = await this.analysisSnapshotService.analyze(
      graph,
      {
        includeHealth: true,
        includeSecurityFindings: input.includeSecurityFindings,
        patternLimit: input.limit || MAX_REVIEW_PATTERNS,
      }
    );
    const resolvedHealth = health!;
    const focus = this.prepareFocusContext(graph, architecture, patterns, input);
    const decompositionGuidance = this.decompositionGuidanceService.prepareGuidance(graph, {
      limit: input.limit || MAX_REVIEW_PATTERNS,
      focusNodeIds: focus?.matches.map((node) => node.id),
    });
    const { qualityBudget, qualityDashboard, refactoringWaves } = buildQualityArtifacts(
      graph,
      resolvedHealth,
      patterns,
      decompositionGuidance,
      this.qualityGovernanceService,
      4
    );

    return {
      graphSummary: createGraphSummary(graph),
      taskMode,
      health: resolvedHealth,
      architecture: {
        summary: architecture.summary,
        layers: architecture.layers,
        dependencies: architecture.dependencies.slice(0, input.limit || MAX_REVIEW_PATTERNS),
        violations: architecture.violations.slice(0, input.limit || MAX_REVIEW_PATTERNS),
        classifications: input.includeClassifications ? architecture.classifications : undefined,
      },
      patterns,
      security: {
        summary: security.summary,
        findings: security.findings.slice(0, MAX_REVIEW_FINDINGS),
      },
      focus,
      qualityBudget,
      qualityDashboard,
      decompositionGuidance,
      refactoringWaves,
      reviewPriorities: buildReviewPriorities(
        graph,
        resolvedHealth,
        architecture,
        patterns,
        security.findings,
        focus,
        decompositionGuidance,
        qualityBudget
      ),
      autopilotPlan: buildReviewAutopilotPlan(
        taskMode,
        security.findings,
        architecture,
        focus,
        resolvedHealth.summary.stackAwareLinks > 0,
        resolvedHealth.summary.refreshPipelineDegraded ||
          resolvedHealth.summary.avgRefreshLatencyMs >= 20 ||
          resolvedHealth.summary.runtimePriorityRebuilds > 0
      ),
      nextSteps: buildReviewNextSteps(
        resolvedHealth,
        architecture,
        patterns,
        security.findings,
        Boolean(focus),
        decompositionGuidance
      ),
    };
  }

  private prepareFocusContext(
    graph: GraphData,
    architecture: ArchitectureOverview,
    patterns: DetectedPattern[],
    input: PrepareReviewContextInput
  ): ReviewContextResult['focus'] {
    if (!input.focusQuery?.trim()) {
      return null;
    }

    const normalizedQuery = input.focusQuery.trim().toLowerCase();
    const matches = searchGraph(graph, input.focusQuery, input.type, MAX_ALTERNATIVES);
    if (matches.length === 0) {
      return {
        query: input.focusQuery,
        matches: [],
        classifications: [],
        relatedPatterns: [],
        relatedViolations: [],
      };
    }

    const promotedMatch = promoteCodeTarget(matches, normalizedQuery);
    if (promotedMatch) {
      const remaining = matches.filter((node) => node.id !== promotedMatch.id);
      matches.splice(0, matches.length, promotedMatch, ...remaining);
    }

    const focusIds = new Set(matches.map((node) => node.id));
    const focusStructuralIds = new Set(matches.map((node) => toStructuralNodeId(node.id)));

    return {
      query: input.focusQuery,
      matches,
      classifications: architecture.classifications.filter(
        (record) =>
          focusIds.has(record.nodeId) || focusStructuralIds.has(toStructuralNodeId(record.nodeId))
      ),
      relatedPatterns: patterns.filter((pattern) =>
        pattern.nodeIds.some(
          (nodeId) => focusIds.has(nodeId) || focusStructuralIds.has(toStructuralNodeId(nodeId))
        )
      ),
      relatedViolations: architecture.violations.filter(
        (violation) =>
          focusStructuralIds.has(toStructuralNodeId(violation.sourceId)) ||
          focusStructuralIds.has(toStructuralNodeId(violation.targetId))
      ),
    };
  }

  private normalizeReviewTaskMode(taskMode?: ReviewTaskMode): ReviewTaskMode {
    return REVIEW_TASK_MODES.includes(taskMode || 'review') ? taskMode || 'review' : 'review';
  }
}
