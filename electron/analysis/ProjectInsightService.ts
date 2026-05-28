import * as path from 'path';
import { getLanguageByExtension } from '../parsing/languageRegistry';
import { GraphData, GraphNode } from '../store';
import {
  buildGraphAdjacency,
  isContractSemanticLink,
  isDiRuntimeLink,
} from './graphAnalysisUtils';
import {
  ArchitectureInsightService,
  ArchitectureLayer,
  ArchitectureOverview,
} from './ArchitectureInsightService';
import { DetectedPattern, PatternDetectionAnalyzer } from './PatternDetectionAnalyzer';
import { HealthScoreAnalyzer, HealthScoreResult } from './HealthScoreAnalyzer';
import { DetectedStack, StackInsightService } from './StackInsightService';
import { StackStructuralInsight, StackTopologyService } from './StackTopologyService';
import { SecurityFinding, SecurityScanner } from './SecurityScanner';
import { DecompositionGuidance, DecompositionGuidanceService } from './DecompositionGuidanceService';
import {
  QualityBudget,
  QualityDashboard,
  QualityGovernanceService,
  RefactoringWave,
} from './QualityGovernanceService';

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
    private readonly stackInsightService = new StackInsightService(),
    private readonly stackTopologyService = new StackTopologyService(),
    private readonly securityScanner = new SecurityScanner(),
    private readonly decompositionGuidanceService = new DecompositionGuidanceService(),
    private readonly qualityGovernanceService = new QualityGovernanceService()
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
    const stackProfile = await this.stackInsightService.analyze(graph);
    const stackTopology = await this.stackTopologyService.analyze(graph, stackProfile);
    const decompositionGuidance = this.decompositionGuidanceService.prepareGuidance(graph, {
      limit: input.limit || PATTERN_LIMIT,
    });
    const qualityBudget = this.qualityGovernanceService.buildBudget({
      health,
      patterns,
      decompositionGuidance,
    });
    const refactoringWaves = this.qualityGovernanceService.buildRefactoringWaves(
      graph,
      decompositionGuidance,
      4
    );
    const qualityDashboard = this.qualityGovernanceService.buildDashboard(
      qualityBudget,
      decompositionGuidance,
      refactoringWaves
    );
    const operationalTelemetry = graph.refreshTelemetry || {
      watcher: {
        flushCount: 0,
        batchedEventCount: 0,
        coalescedFlushes: 0,
        maxBatchSize: 0,
        lastBatchSize: 0,
        lastEvent: null,
        recentBatchSizes: [],
      },
      enrichment: {
        skippedRefreshes: 0,
        rebuiltRefreshes: 0,
        runtimePriorityRebuilds: 0,
        directoryTriggeredRebuilds: 0,
        avgRefreshLatencyMs: 0,
        lastRefreshMode: null,
        lastRefreshReason: null,
        recentLatencyMs: [],
        recentModes: [],
      },
      trends: {
        watcher: {
          coalescingRatio: 0,
          batchSizeTrend: 'stable',
        },
        enrichment: {
          skipRate: 0,
          runtimePriorityRate: 0,
          latencyTrend: 'stable',
          degraded: false,
        },
      },
    };

    return {
      graphSummary,
      projectProfile: {
        primaryTechnologies: this.detectPrimaryTechnologies(graph),
        languageSupportSummary: this.detectLanguageSupportSummary(graph),
        stackProfile,
        stackTopology,
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
      operationalTelemetry,
      patterns,
      security: {
        summary: security.summary,
        findings: security.findings.slice(0, FINDING_LIMIT),
      },
      mentalModel,
      autopilotPlan: this.buildAutopilotPlan(architecture, health, patterns, mentalModel),
      qualityBudget,
      qualityDashboard,
      decompositionGuidance,
      refactoringWaves,
      nextSteps: this.buildNextSteps(
        health,
        architecture,
        patterns,
        security.findings,
        mentalModel,
        operationalTelemetry,
        decompositionGuidance,
        qualityBudget,
        refactoringWaves
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

    const runtimeCompositionRoots = fileNodes
      .map((node) => ({
        node,
        degree: (outgoingBySource.get(node.id) || []).filter((link) => isDiRuntimeLink(link)).length,
      }))
      .filter(({ degree }) => degree > 0)
      .sort((a, b) => b.degree - a.degree || a.node.label.localeCompare(b.node.label))
      .slice(0, FILE_LIMIT)
      .map(({ node }) => node);

    const contractSurfaces = fileNodes
      .map((node) => ({
        node,
        degree: (outgoingBySource.get(node.id) || []).filter((link) => isContractSemanticLink(link))
          .length,
      }))
      .filter(({ degree }) => degree > 0)
      .sort((a, b) => b.degree - a.degree || a.node.label.localeCompare(b.node.label))
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
      runtimeCompositionRoots,
      contractSurfaces,
      sharedFoundations,
      keyBoundaries,
      likelyWorkflows: this.buildLikelyWorkflows(architecture, graph),
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

  private detectLanguageSupportSummary(
    graph: GraphData
  ): ProjectInsightResult['projectProfile']['languageSupportSummary'] {
    const counts = new Map<
      string,
      {
        id: string;
        displayName: string;
        supportTier: 'semantic' | 'structural' | 'limited' | 'metadata';
        fileCount: number;
      }
    >();

    for (const node of graph.nodes) {
      if (node.type !== 'file') {
        continue;
      }

      const definition = getLanguageByExtension(path.extname(toStructuralNodeId(node.id)).toLowerCase());
      if (!definition) {
        continue;
      }

      const existing = counts.get(definition.id);
      if (existing) {
        existing.fileCount += 1;
        continue;
      }

      counts.set(definition.id, {
        id: definition.id,
        displayName: definition.displayName,
        supportTier: definition.supportTier,
        fileCount: 1,
      });
    }

    return Array.from(counts.values())
      .sort((a, b) => b.fileCount - a.fileCount || a.displayName.localeCompare(b.displayName))
      .slice(0, 10);
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
        ...mentalModel.runtimeCompositionRoots.map((node) => node.id),
        ...mentalModel.contractSurfaces.map((node) => node.id),
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
    mentalModel: ProjectInsightResult['mentalModel'],
    operationalTelemetry: ProjectInsightResult['operationalTelemetry'],
    decompositionGuidance: DecompositionGuidance,
    qualityBudget: QualityBudget,
    refactoringWaves: RefactoringWave[]
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

    if (mentalModel.runtimeCompositionRoots.length > 0) {
      nextSteps.push(
        'Review runtime composition roots separately: these files wire provider bindings, bean factories, or service registrations and often hide non-import architectural coupling.'
      );
    }

    if (mentalModel.contractSurfaces.length > 0) {
      nextSteps.push(
        'Inspect API contract surfaces separately: schema roots and generated/runtime bindings often widen impact beyond direct imports and file-local edits.'
      );
    }

    if (operationalTelemetry.watcher.coalescedFlushes > 0) {
      nextSteps.push(
        'Validate watcher batching metrics and keep hot edit bursts coalesced, otherwise incremental refresh will waste cycles on repeated graph updates.'
      );
    }

    if (operationalTelemetry.enrichment.runtimePriorityRebuilds > 0) {
      nextSteps.push(
        'Inspect runtime-priority rebuild paths and keep composition roots explicit, because they dominate incremental stack enrichment cost.'
      );
    }

    if (patterns.length > 0) {
      nextSteps.push(
        'Analyze hotspot patterns and understand which are real architectural risks and which are acceptable coordination centers.'
      );
    }

    if (
      patterns.some(
        (pattern) =>
          pattern.id === 'oversized_modules' ||
          pattern.id === 'god_files' ||
          pattern.id === 'god_classes' ||
          pattern.id === 'long_methods' ||
          pattern.id === 'complex_methods' ||
          pattern.id === 'mixed_responsibility_modules'
      )
    ) {
      nextSteps.push(
        'Prioritize decomposition of design-smell hotspots: split oversized modules, extract god classes, shorten long methods, and separate orchestration from contracts/helpers before adding more responsibilities.'
      );
    }

    if (decompositionGuidance.candidates.length > 0) {
      nextSteps.push(
        'Use decomposition guidance as a concrete extraction queue: start with the highest-score class/method candidates instead of growing already overloaded hotspots.'
      );
    }

    if (refactoringWaves.length > 0) {
      nextSteps.push(
        `Execute architectural cleanup in waves: start with "${refactoringWaves[0].title}" before deeper class/method simplification.`
      );
    }

    nextSteps.push(this.qualityGovernanceService.summarizeBudgetForStep(qualityBudget));

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

    if (health.summary.maintainabilityScore < 85 || health.summary.solidScore < 85) {
      nextSteps.push(
        `Treat design debt as delivery risk: maintainability=${health.summary.maintainabilityScore.toFixed(1)}, solid=${health.summary.solidScore.toFixed(1)}. Prefer extraction and boundary cleanup before adding more orchestration logic.`
      );
    }

    if (architecture.summary.violationCount > 0 || architecture.summary.unknownNodes > 0) {
      nextSteps.push(
        'Close architectural gaps in layer classification and boundary rules, otherwise the agent autopilot will be less accurate.'
      );
    }

    return nextSteps;
  }

  private buildLikelyWorkflows(architecture: ArchitectureOverview, graph: GraphData) {
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
    if (graph.links.some((link) => isDiRuntimeLink(link))) {
      workflows.push(
        'Runtime DI contracts: Composition roots wire providers/services to concrete implementations beyond plain import dependencies.'
      );
    }
    if (graph.links.some((link) => isContractSemanticLink(link))) {
      workflows.push(
        'API contract -> generated/runtime: OpenAPI and protobuf schemas bind to generated clients, handlers, and servers beyond plain import edges.'
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
