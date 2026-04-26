import { GraphData, GraphNode } from '../store';
import { buildGraphAdjacency } from './graphAnalysisUtils';
import {
  ArchitectureInsightService,
  ArchitectureLayer,
  ArchitectureNodeClassification,
  ArchitectureOverview,
} from './ArchitectureInsightService';
import { DetectedPattern, PatternDetectionAnalyzer } from './PatternDetectionAnalyzer';
import { HealthScoreAnalyzer, HealthScoreResult } from './HealthScoreAnalyzer';
import { SecurityFinding, SecurityScanner } from './SecurityScanner';

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
  nextSteps: string[];
}

const FILE_LIMIT = 8;
const PATTERN_LIMIT = 10;
const FINDING_LIMIT = 10;

const toStructuralNodeId = (nodeId: string) => nodeId.split('#')[0];
const unique = <T>(items: T[]) => Array.from(new Set(items));

const TECHNOLOGY_ALIASES: Array<{ match: RegExp; label: string }> = [
  { match: /\.tsx?$/u, label: 'TypeScript' },
  { match: /\.jsx?$/u, label: 'JavaScript' },
  { match: /\.json$/u, label: 'JSON' },
  { match: /\.css$/u, label: 'CSS' },
  { match: /\.md$/u, label: 'Markdown' },
];

export class ProjectInsightService {
  constructor(
    private readonly architectureInsightService = new ArchitectureInsightService(),
    private readonly healthScoreAnalyzer = new HealthScoreAnalyzer(),
    private readonly patternDetectionAnalyzer = new PatternDetectionAnalyzer(),
    private readonly securityScanner = new SecurityScanner()
  ) {}

  async prepareContext(
    graph: GraphData,
    input: PrepareProjectContextInput = {}
  ): Promise<ProjectInsightResult> {
    const architecture = this.architectureInsightService.analyze(graph);
    const health = this.healthScoreAnalyzer.analyze(graph);
    const patterns = this.patternDetectionAnalyzer
      .analyze(graph)
      .patterns.slice(0, input.limit || PATTERN_LIMIT);
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
    const graphSummary = this.createGraphSummary(graph);
    const mentalModel = this.buildMentalModel(graph, architecture);

    return {
      graphSummary,
      projectProfile: {
        primaryTechnologies: this.detectPrimaryTechnologies(graph),
        projectShape: this.describeProjectShape(architecture),
        architectureMaturity: this.getArchitectureMaturity(health, architecture),
      },
      architecture: {
        summary: architecture.summary,
        layers: architecture.layers,
        dependencies: architecture.dependencies.slice(0, input.limit || PATTERN_LIMIT),
        classifications: input.includeClassifications ? architecture.classifications : undefined,
      },
      health,
      patterns,
      security: {
        summary: security.summary,
        findings: security.findings.slice(0, FINDING_LIMIT),
      },
      mentalModel,
      autopilotPlan: this.buildAutopilotPlan(architecture, health, patterns, mentalModel),
      nextSteps: this.buildNextSteps(
        health,
        architecture,
        patterns,
        security.findings,
        mentalModel
      ),
    };
  }

  private buildMentalModel(
    graph: GraphData,
    architecture: ArchitectureOverview
  ): ProjectInsightResult['mentalModel'] {
    const { incomingByTarget, outgoingBySource } = buildGraphAdjacency(graph);
    const layerByNodeId = new Map(
      architecture.classifications.map((record) => [record.nodeId, record.layer])
    );
    const fileNodes = graph.nodes.filter((node) => node.type === 'file');

    const entryPoints = fileNodes
      .filter((node) =>
        this.isEntryPointCandidate(
          node,
          layerByNodeId.get(node.id),
          incomingByTarget.get(node.id)?.length || 0
        )
      )
      .map((node) => ({
        node,
        score: this.scoreEntryPoint(
          node,
          layerByNodeId.get(node.id),
          incomingByTarget.get(node.id)?.length || 0,
          outgoingBySource.get(node.id)?.length || 0
        ),
      }))
      .sort((a, b) => b.score - a.score || a.node.label.localeCompare(b.node.label))
      .slice(0, FILE_LIMIT)
      .map(({ node }) => node);

    const coreOrchestrators = fileNodes
      .filter((node) =>
        ['application', 'analysis', 'integration'].includes(layerByNodeId.get(node.id) || '')
      )
      .map((node) => ({
        node,
        fanOut: outgoingBySource.get(node.id)?.length || 0,
        fanIn: incomingByTarget.get(node.id)?.length || 0,
      }))
      .filter(({ fanOut, fanIn }) => fanOut > 0 || fanIn > 0)
      .sort(
        (a, b) =>
          b.fanOut + b.fanIn - (a.fanOut + a.fanIn) || a.node.label.localeCompare(b.node.label)
      )
      .slice(0, FILE_LIMIT)
      .map(({ node }) => node);

    const sharedFoundations = fileNodes
      .filter((node) => ['shared', 'state'].includes(layerByNodeId.get(node.id) || ''))
      .map((node) => ({
        node,
        fanIn: incomingByTarget.get(node.id)?.length || 0,
      }))
      .filter(({ fanIn }) => fanIn > 0)
      .sort((a, b) => b.fanIn - a.fanIn || a.node.label.localeCompare(b.node.label))
      .slice(0, FILE_LIMIT)
      .map(({ node }) => node);

    const keyBoundaries = architecture.dependencies
      .filter((entry) => entry.sourceLayer !== entry.targetLayer)
      .slice(0, 6)
      .map((entry) => `${entry.sourceLayer} -> ${entry.targetLayer} (${entry.count})`);

    return {
      entryPoints,
      coreOrchestrators,
      sharedFoundations,
      keyBoundaries,
      likelyWorkflows: this.buildLikelyWorkflows(architecture),
    };
  }

  private detectPrimaryTechnologies(graph: GraphData) {
    const counts = new Map<string, number>();
    for (const node of graph.nodes) {
      if (node.type !== 'file' && node.type !== 'adr') {
        continue;
      }

      const normalizedId = toStructuralNodeId(node.id).toLowerCase();
      const alias = TECHNOLOGY_ALIASES.find((candidate) => candidate.match.test(normalizedId));
      const label = alias?.label || 'Other';
      counts.set(label, (counts.get(label) || 0) + 1);
    }

    return Array.from(counts.entries())
      .map(([name, fileCount]) => ({ name, fileCount }))
      .sort((a, b) => b.fileCount - a.fileCount || a.name.localeCompare(b.name))
      .slice(0, 5);
  }

  private describeProjectShape(architecture: ArchitectureOverview) {
    const layers = new Set(architecture.layers.map((entry) => entry.layer));
    if (
      layers.has('presentation') &&
      layers.has('application') &&
      layers.has('analysis') &&
      layers.has('parsing')
    ) {
      return 'Multi-layered system with distinct UI, orchestration, analysis, and parsing zones.';
    }
    if (layers.has('presentation') && layers.has('application')) {
      return 'Application with a clear separation of UI and orchestration.';
    }
    if (layers.has('analysis') || layers.has('parsing')) {
      return 'Tooling/analytical project with a dominant backend/analysis core.';
    }
    return 'Project structure is partially recognized; consider deepening the classification and entry points.';
  }

  private getArchitectureMaturity(
    health: HealthScoreResult,
    architecture: ArchitectureOverview
  ): 'strong' | 'fair' | 'weak' {
    if (
      health.score >= 90 &&
      architecture.summary.violationCount === 0 &&
      architecture.summary.unknownNodes === 0
    ) {
      return 'strong';
    }
    if (health.score >= 75 && architecture.summary.violationCount <= 5) {
      return 'fair';
    }
    return 'weak';
  }

  private buildAutopilotPlan(
    architecture: ArchitectureOverview,
    health: HealthScoreResult,
    patterns: DetectedPattern[],
    mentalModel: ProjectInsightResult['mentalModel']
  ): ProjectInsightResult['autopilotPlan'] {
    const preferredSequence: ProjectInsightResult['autopilotPlan']['preferredSequence'] = [
      'survey_project',
    ];

    if (architecture.summary.violationCount > 0 || architecture.summary.unknownNodes > 0) {
      preferredSequence.push('review_architecture');
    }

    if (patterns.length > 0 || health.issues.length > 0) {
      preferredSequence.push('inspect_hotspots');
    }

    preferredSequence.push('prepare_change', 'prepare_review');

    return {
      primaryGoal:
        'Form a working architectural mental model of the project for the agent before starting changes or reviews.',
      preferredSequence,
      recommendedStartingNodes: unique([
        ...mentalModel.entryPoints.map((node) => node.id),
        ...mentalModel.coreOrchestrators.map((node) => node.id),
      ]).slice(0, 10),
      shouldFallbackToLowLevelTools:
        architecture.summary.unknownNodes > 0 || mentalModel.entryPoints.length === 0,
    };
  }

  private buildNextSteps(
    health: HealthScoreResult,
    architecture: ArchitectureOverview,
    patterns: DetectedPattern[],
    securityFindings: SecurityFinding[],
    mentalModel: ProjectInsightResult['mentalModel']
  ) {
    const nextSteps = [
      'First read entry points and core orchestrators to fix real control flows across the project.',
      'After a general overview, use prepare_change_context for any non-trivial change and prepare_review_context for audit/validation.',
    ];

    if (mentalModel.sharedFoundations.length > 0) {
      nextSteps.push(
        'Separately check shared foundations: these are nodes with high reuse and potentially wide blast radius.'
      );
    }

    if (patterns.length > 0) {
      nextSteps.push(
        'Analyze hotspot patterns and understand which are real architectural risks and which are acceptable coordination centers.'
      );
    }

    if (securityFindings.length > 0) {
      nextSteps.unshift(
        'Before making changes, review security findings and eliminate unsafe practices with processes, files, and user input.'
      );
    }

    if (health.issues.length > 0) {
      nextSteps.push(
        'Compare health issues with the actual project structure and adjust heuristics where they are noisy.'
      );
    }

    if (architecture.summary.violationCount > 0 || architecture.summary.unknownNodes > 0) {
      nextSteps.push(
        'Close architectural gaps in layer classification and boundary rules, otherwise the agent autopilot will be less accurate.'
      );
    }

    return nextSteps;
  }

  private buildLikelyWorkflows(architecture: ArchitectureOverview) {
    const layers = new Set(architecture.layers.map((entry) => entry.layer));
    const workflows: string[] = [];

    if (layers.has('presentation') && layers.has('state')) {
      workflows.push(
        'UI -> state: User actions pass through presentation and are stored in the state layer.'
      );
    }
    if (layers.has('integration') && layers.has('application')) {
      workflows.push(
        'Integration -> application: Input adapters and MCP/entrypoints coordinate backend orchestration.'
      );
    }
    if (layers.has('application') && layers.has('parsing')) {
      workflows.push(
        'Application -> parsing: Orchestration layer triggers language parsing and project indexing.'
      );
    }
    if (layers.has('analysis') && layers.has('state')) {
      workflows.push(
        'Analysis -> state: Analytics services rely on the normalized graph and store representation.'
      );
    }

    if (workflows.length === 0) {
      workflows.push(
        'Explicit system workflows are partially recognized; consider expanding the entry points and runtime flow model.'
      );
    }

    return workflows;
  }

  private isEntryPointCandidate(
    node: GraphNode,
    layer: ArchitectureLayer | undefined,
    fanIn: number
  ) {
    if (layer === 'configuration') {
      return false;
    }

    const normalizedId = node.id.toLowerCase();
    const explicitEntrypoint =
      /(?:^|\/)(main|app|server|cli|index|preload|worker|mcp|oracle)\.(?:ts|tsx|js|jsx)$/u.test(
        normalizedId
      );
    if (explicitEntrypoint) {
      return true;
    }

    return Boolean(layer === 'integration' && fanIn === 0);
  }

  private scoreEntryPoint(
    node: GraphNode,
    layer: ArchitectureLayer | undefined,
    fanIn: number,
    fanOut: number
  ) {
    const normalizedId = node.id.toLowerCase();
    let score = fanOut * 3 - fanIn;

    if (layer === 'integration') score += 20;
    if (layer === 'application') score += 16;
    if (layer === 'presentation') score += 12;
    if (
      /(?:^|\/)(main|app|server|cli|index|preload|worker|mcp|oracle)\.(?:ts|tsx|js|jsx)$/u.test(
        normalizedId
      )
    ) {
      score += 25;
    }

    return score;
  }

  private createGraphSummary(graph: GraphData) {
    return {
      projectRoot: graph.projectRoot,
      nodesCount: graph.nodes.length,
      linksCount: graph.links.length,
      nodeTypes: graph.nodes.reduce<Record<string, number>>((acc, node) => {
        acc[node.type] = (acc[node.type] || 0) + 1;
        return acc;
      }, {}),
    };
  }
}
