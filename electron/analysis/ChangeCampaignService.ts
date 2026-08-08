import { GraphData, GraphNode } from '../store';
import {
  ArchitectureLayer,
  ArchitectureOverview,
  ArchitectureViolation,
} from './ArchitectureInsightService';
import { BlastRadiusAnalyzer } from './BlastRadiusAnalyzer';
import { ChangeTaskMode } from './ChangeContextService';
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
import { buildQualityArtifacts } from './contextSupport';
import { AnalysisSnapshotService } from './AnalysisSnapshotService';
import { createGraphSummary, unique } from './AgentContextUtils';
import {
  buildChangeCampaignBlastRadius,
  buildChangeCampaignNextSteps,
  buildChangeCampaignRisks,
  buildCampaignSecurityView,
  buildExecutionWaves,
  buildLayersInvolved,
  collectCampaignPatterns,
  collectCampaignSecurityFindings,
  collectCampaignViolations,
  collectMatchedFiles,
  collectRuntimeCompositionRoots,
  collectStructuralNodeIds,
  expandAffectedFiles,
  getCampaignBreadth,
  getCampaignNodeTypePriority,
  scoreCampaignNodeMatch,
} from './changeCampaignSupport';

export interface PrepareChangeCampaignInput {
  userRequest: string;
  candidateQueries: string[];
  seedNodeIds?: string[];
  taskMode?: ChangeTaskMode;
  depth?: number;
  maxSeeds?: number;
  maxFiles?: number;
  includeSecurityFindings?: boolean;
}

export interface ChangeCampaignResult {
  graphSummary: {
    projectRoot: string;
    nodesCount: number;
    linksCount: number;
    nodeTypes: Record<string, number>;
  };
  taskMode: ChangeTaskMode;
  userRequest: string;
  scope: {
    candidateQueries: string[];
    seedTargets: GraphNode[];
    directlyMatchedFiles: GraphNode[];
    runtimeCompositionRoots: GraphNode[];
    affectedFiles: GraphNode[];
    breadth: 'small' | 'medium' | 'large';
  };
  architecture: {
    summary: ArchitectureOverview['summary'];
    layersInvolved: Array<{ layer: ArchitectureLayer; count: number }>;
    campaignViolations: ArchitectureViolation[];
  };
  blastRadius: {
    seeds: Array<{
      nodeId: string;
      confidence: 'high' | 'medium' | 'low';
      affectedFiles: string[];
    }>;
    totalAffectedFiles: number;
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
  qualityBudget: QualityBudget;
  qualityDashboard: QualityDashboard;
  decompositionGuidance: DecompositionGuidance;
  executionPlan: {
    preferredExecutionMode: 'multi_target_campaign';
    waves: Array<{
      id: string;
      title: string;
      goal: string;
      layer: ArchitectureLayer | 'mixed';
      fileIds: string[];
    }>;
    refactoringWaves: RefactoringWave[];
    shouldFallbackToLowLevelTools: boolean;
  };
  risks: string[];
  nextSteps: string[];
}

const DEFAULT_MAX_SEEDS = 8;
const DEFAULT_MAX_FILES = 30;
const CAMPAIGN_NODE_TYPES = ['file', 'class', 'function'];

export class ChangeCampaignService {
  constructor(
    private readonly analysisSnapshotService = new AnalysisSnapshotService(),
    private readonly blastRadiusAnalyzer = new BlastRadiusAnalyzer(),
    private readonly decompositionGuidanceService = new DecompositionGuidanceService(),
    private readonly qualityGovernanceService = new QualityGovernanceService()
  ) {}

  async prepareContext(
    graph: GraphData,
    input: PrepareChangeCampaignInput
  ): Promise<ChangeCampaignResult> {
    const taskMode = input.taskMode || 'refactor';
    const depth = input.depth || 2;
    const maxFiles = input.maxFiles || DEFAULT_MAX_FILES;
    const maxSeeds = input.maxSeeds || DEFAULT_MAX_SEEDS;
    const {
      architecture,
      health,
      patterns: snapshotPatterns,
      security: securityScan,
    } = await this.analysisSnapshotService.analyze(graph, {
      includeHealth: true,
      includeSecurityFindings: input.includeSecurityFindings,
    });
    const resolvedHealth = health!;
    const layerByNodeId = new Map(
      architecture.classifications.map((record) => [record.nodeId, record])
    );
    const seedTargets = this.resolveSeedTargets(graph, input, architecture, maxSeeds);
    const directlyMatchedFiles = collectMatchedFiles(
      graph,
      seedTargets,
      input.candidateQueries,
      maxSeeds
    );
    const runtimeCompositionRoots = collectRuntimeCompositionRoots(graph, directlyMatchedFiles);
    const scopedFiles = unique([...directlyMatchedFiles, ...runtimeCompositionRoots]);
    const affectedFiles = expandAffectedFiles(graph, scopedFiles, depth, maxFiles);
    const blastRadius = buildChangeCampaignBlastRadius(
      graph,
      scopedFiles,
      depth,
      maxFiles,
      this.blastRadiusAnalyzer
    );
    const campaignStructuralIds = collectStructuralNodeIds(affectedFiles);
    const patterns = collectCampaignPatterns(snapshotPatterns, campaignStructuralIds);
    const securityFindings = collectCampaignSecurityFindings(
      securityScan.findings,
      campaignStructuralIds
    );
    const layersInvolved = buildLayersInvolved(affectedFiles, layerByNodeId);
    const campaignViolations = collectCampaignViolations(
      architecture.violations,
      campaignStructuralIds
    );
    const waves = buildExecutionWaves(affectedFiles, layerByNodeId, runtimeCompositionRoots);
    const decompositionGuidance = this.decompositionGuidanceService.prepareGuidance(graph, {
      limit: 12,
      focusNodeIds: Array.from(campaignStructuralIds),
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
      userRequest: input.userRequest,
      scope: this.buildScope(
        input.candidateQueries,
        seedTargets,
        directlyMatchedFiles,
        runtimeCompositionRoots,
        affectedFiles
      ),
      architecture: {
        summary: architecture.summary,
        layersInvolved,
        campaignViolations,
      },
      blastRadius,
      patterns,
      security: buildCampaignSecurityView(securityFindings),
      qualityBudget,
      qualityDashboard,
      decompositionGuidance,
      executionPlan: {
        preferredExecutionMode: 'multi_target_campaign',
        waves,
        refactoringWaves,
        shouldFallbackToLowLevelTools:
          directlyMatchedFiles.length === 0 && runtimeCompositionRoots.length === 0,
      },
      risks: buildChangeCampaignRisks(
        affectedFiles,
        runtimeCompositionRoots,
        layersInvolved,
        campaignViolations,
        patterns,
        securityFindings
      ),
      nextSteps: buildChangeCampaignNextSteps({
        taskMode,
        directlyMatchedFiles,
        affectedFiles,
        runtimeCompositionRoots,
        waves,
        hasSecurityFindings: securityFindings.length > 0,
        qualityBudget,
        refactoringWaves,
        qualityGovernanceService: this.qualityGovernanceService,
      }),
    };
  }

  private resolveSeedTargets(
    graph: GraphData,
    input: PrepareChangeCampaignInput,
    architecture: ArchitectureOverview,
    maxSeeds: number
  ) {
    const seedNodes = new Map<string, GraphNode>();

    for (const seedNodeId of input.seedNodeIds || []) {
      const exact = graph.nodes.find((node) => node.id === seedNodeId);
      if (exact) {
        seedNodes.set(exact.id, exact);
      }
    }

    const candidates = graph.nodes
      .filter((node) => CAMPAIGN_NODE_TYPES.includes(node.type))
      .map((node) => ({
        node,
        score: input.candidateQueries.reduce(
          (max, query) => Math.max(max, scoreCampaignNodeMatch(node, query)),
          0
        ),
      }))
      .filter(({ score }) => score > 0)
      .sort(
        (a, b) =>
          b.score - a.score ||
          getCampaignNodeTypePriority(b.node.type) - getCampaignNodeTypePriority(a.node.type) ||
          a.node.label.localeCompare(b.node.label)
      )
      .slice(0, maxSeeds * 3);

    for (const { node } of candidates) {
      seedNodes.set(node.id, node);
      if (seedNodes.size >= maxSeeds) {
        break;
      }
    }

    // If no explicit file-level matches were found, include top orchestrators from likely impacted layers
    if (seedNodes.size === 0) {
      const fallback = architecture.classifications
        .filter((record) => ['application', 'integration', 'analysis'].includes(record.layer))
        .slice(0, maxSeeds)
        .map((record) => graph.nodes.find((node) => node.id === record.nodeId))
        .filter((node): node is GraphNode => Boolean(node));
      for (const node of fallback) {
        seedNodes.set(node.id, node);
      }
    }

    return Array.from(seedNodes.values()).slice(0, maxSeeds);
  }

  private buildScope(
    candidateQueries: string[],
    seedTargets: GraphNode[],
    directlyMatchedFiles: GraphNode[],
    runtimeCompositionRoots: GraphNode[],
    affectedFiles: GraphNode[]
  ): ChangeCampaignResult['scope'] {
    return {
      candidateQueries,
      seedTargets,
      directlyMatchedFiles,
      runtimeCompositionRoots,
      affectedFiles,
      breadth: getCampaignBreadth(affectedFiles.length),
    };
  }
}
