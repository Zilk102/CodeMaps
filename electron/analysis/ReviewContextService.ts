import { GraphData, GraphNode } from '../store';
import {
  ArchitectureInsightService,
  ArchitectureNodeClassification,
  ArchitectureOverview,
  ArchitectureViolation,
} from './ArchitectureInsightService';
import { HealthScoreAnalyzer, HealthScoreResult } from './HealthScoreAnalyzer';
import { DetectedPattern, PatternDetectionAnalyzer } from './PatternDetectionAnalyzer';
import { SecurityFinding, SecurityScanner } from './SecurityScanner';
import {
  createGraphSummary,
  promoteCodeTarget,
  searchGraph,
  toStructuralNodeId,
  unique,
} from './AgentContextUtils';

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
    private readonly architectureInsightService = new ArchitectureInsightService(),
    private readonly healthScoreAnalyzer = new HealthScoreAnalyzer(),
    private readonly patternDetectionAnalyzer = new PatternDetectionAnalyzer(),
    private readonly securityScanner = new SecurityScanner()
  ) {}

  async prepareReviewContext(
    graph: GraphData,
    input: PrepareReviewContextInput
  ): Promise<ReviewContextResult> {
    const taskMode = this.normalizeReviewTaskMode(input.taskMode);
    const architecture = this.architectureInsightService.analyze(graph);
    const health = this.healthScoreAnalyzer.analyze(graph);
    const patterns = this.patternDetectionAnalyzer
      .analyze(graph)
      .patterns.slice(0, input.limit || MAX_REVIEW_PATTERNS);
    const security =
      input.includeSecurityFindings === false
        ? {
            findings: [],
            summary: {
              total: 0,
              critical: 0,
              high: 0,
              medium: 0,
              low: 0,
            },
          }
        : await this.securityScanner.analyze(graph);
    const focus = this.prepareFocusContext(graph, architecture, patterns, input);

    return {
      graphSummary: createGraphSummary(graph),
      taskMode,
      health,
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
      reviewPriorities: this.buildReviewPriorities(
        health,
        architecture,
        patterns,
        security.findings,
        focus
      ),
      autopilotPlan: this.buildReviewAutopilotPlan(
        taskMode,
        security.findings,
        architecture,
        focus
      ),
      nextSteps: this.buildReviewNextSteps(
        health,
        architecture,
        patterns,
        security.findings,
        Boolean(focus)
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

  private buildReviewPriorities(
    health: HealthScoreResult,
    architecture: ArchitectureOverview,
    patterns: DetectedPattern[],
    securityFindings: SecurityFinding[],
    focus: ReviewContextResult['focus']
  ): ReviewPriority[] {
    const priorities: ReviewPriority[] = [];

    if (securityFindings.some((finding) => finding.severity === 'critical')) {
      priorities.push({
        severity: 'critical',
        title: 'Security Findings',
        reason:
          'The project has critical security findings; they must be addressed before any architectural cosmetics.',
        nodeIds: unique(
          securityFindings
            .filter((finding) => finding.severity === 'critical')
            .map((finding) => finding.nodeId)
        ).slice(0, 10),
      });
    }

    if (architecture.violations.length > 0) {
      priorities.push({
        severity: architecture.violations.length > 10 ? 'high' : 'medium',
        title: 'Architecture Violations',
        reason:
          'Layer dependency violations harm maintainability and make impact analysis less predictable.',
        nodeIds: unique(
          architecture.violations
            .slice(0, 10)
            .flatMap((violation) => [violation.sourceId, violation.targetId])
        ),
      });
    }

    const severePatterns = patterns.filter((pattern) => pattern.severity === 'high');
    if (severePatterns.length > 0) {
      priorities.push({
        severity: 'high',
        title: 'High-Severity Patterns',
        reason:
          'The graph contains hotspots and anti-pattern candidates that increase blast radius and churn risk.',
        nodeIds: unique(severePatterns.flatMap((pattern) => pattern.nodeIds)).slice(0, 10),
      });
    }

    if (health.issues.length > 0) {
      priorities.push({
        severity: health.grade === 'F' || health.grade === 'D' ? 'high' : 'medium',
        title: 'Health Issues',
        reason:
          'Health score already signals structural degradation: the review must explicitly cover these issues.',
        nodeIds: [],
      });
    }

    if (focus && focus.matches.length > 0) {
      priorities.push({
        severity: 'low',
        title: 'Focused Review Scope',
        reason: `There is an explicit focus query "${focus.query}", so it is worth double-checking local dependencies and the layer of the target area.`,
        nodeIds: focus.matches.map((node) => node.id),
      });
    }

    return priorities.slice(0, 6);
  }

  private buildReviewNextSteps(
    health: HealthScoreResult,
    architecture: ArchitectureOverview,
    patterns: DetectedPattern[],
    securityFindings: SecurityFinding[],
    hasFocus: boolean
  ) {
    const nextSteps = [
      'Start the review with nodes that fell into top architecture violations and severe patterns.',
      'Check if high fan-in/high fan-out nodes hide excessive responsibility and incorrect module boundaries.',
    ];

    if (securityFindings.length > 0) {
      nextSteps.unshift('Address security findings first, especially critical and high severity ones.');
    }

    if (health.issues.length > 0) {
      nextSteps.push(
        'Cross-check health issues with the actual code and determine what is a real problem and what is heuristic noise.'
      );
    }

    if (architecture.summary.unknownNodes > 0) {
      nextSteps.push(
        'Refine layer classification rules for unknown nodes so the agent and review rely on a more accurate model.'
      );
    }

    if (patterns.length === 0) {
      nextSteps.push(
        'No obvious structural patterns found; the review should focus on code contracts and runtime behavior.'
      );
    }

    if (hasFocus) {
      nextSteps.push(
        'After a general overview, do a separate local review for the focus area and check its blast radius manually.'
      );
    }

    return nextSteps;
  }

  private buildReviewAutopilotPlan(
    taskMode: ReviewTaskMode,
    securityFindings: SecurityFinding[],
    architecture: ArchitectureOverview,
    focus: ReviewContextResult['focus']
  ) {
    const preferredOrder: Array<
      'security' | 'architecture' | 'patterns' | 'health' | 'focused_area'
    > = [];

    if (taskMode === 'security' || securityFindings.length > 0) {
      preferredOrder.push('security');
    }
    if (taskMode === 'architecture' || architecture.violations.length > 0) {
      preferredOrder.push('architecture');
    }
    preferredOrder.push('patterns', 'health');
    if (focus?.matches.length) {
      preferredOrder.push('focused_area');
    }

    return {
      primaryGoal: this.describeReviewModeGoal(taskMode),
      preferredOrder: unique(preferredOrder),
      shouldFallbackToLowLevelTools: Boolean(
        focus?.matches.length && !focus.relatedPatterns.length && !focus.relatedViolations.length
      ),
    };
  }

  private normalizeReviewTaskMode(taskMode?: ReviewTaskMode): ReviewTaskMode {
    return REVIEW_TASK_MODES.includes(taskMode || 'review') ? taskMode || 'review' : 'review';
  }

  private describeReviewModeGoal(taskMode: ReviewTaskMode) {
    switch (taskMode) {
      case 'architecture':
        return 'Check architectural boundaries, layers, and module responsibilities.';
      case 'security':
        return 'Find and prioritize security risks and unsafe patterns.';
      case 'stabilization':
        return 'Identify points of structural instability and maintainability degradation.';
      case 'review':
      default:
        return 'Gather architectural and qualitative context for a meaningful review.';
    }
  }
}
