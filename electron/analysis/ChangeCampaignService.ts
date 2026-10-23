import { GraphData, GraphNode } from '../store/types';
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
import { unique } from './AgentContextUtils';
import {
  buildChangeCampaignBlastRadius,
  collectCampaignPatterns,
  collectCampaignSecurityFindings,
  collectCampaignViolations,
  collectMatchedFiles,
  collectRuntimeCompositionRoots,
  collectStructuralNodeIds,
  expandAffectedFiles,
} from './changeCampaignSupport';
import { assembleCampaignResult, CampaignFileScope } from './changeCampaignAssembly';
import { resolveCampaignSeedTargets } from './changeCampaignSeeds';

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
    const layerByNodeId = new Map(
      architecture.classifications.map((record) => [record.nodeId, record])
    );
    const seedTargets = resolveCampaignSeedTargets(graph, input, architecture, maxSeeds);
    const scope = this.resolveFileScope(graph, input, seedTargets, depth, maxFiles, maxSeeds);
    const campaignStructuralIds = collectStructuralNodeIds(scope.affectedFiles);
    const patterns = collectCampaignPatterns(snapshotPatterns, campaignStructuralIds);
    const securityFindings = collectCampaignSecurityFindings(
      securityScan.findings,
      campaignStructuralIds
    );
    const decompositionGuidance = this.decompositionGuidanceService.prepareGuidance(graph, {
      limit: 12,
      focusNodeIds: Array.from(campaignStructuralIds),
    });
    const quality = buildQualityArtifacts(
      graph,
      health!,
      patterns,
      decompositionGuidance,
      this.qualityGovernanceService,
      4
    );

    return assembleCampaignResult({
      graph,
      input,
      taskMode,
      architecture,
      layerByNodeId,
      seedTargets,
      scope,
      campaignViolations: collectCampaignViolations(architecture.violations, campaignStructuralIds),
      patterns,
      securityFindings,
      decompositionGuidance,
      quality,
      qualityGovernanceService: this.qualityGovernanceService,
    });
  }

  private resolveFileScope(
    graph: GraphData,
    input: PrepareChangeCampaignInput,
    seedTargets: GraphNode[],
    depth: number,
    maxFiles: number,
    maxSeeds: number
  ): CampaignFileScope {
    const directlyMatchedFiles = collectMatchedFiles(
      graph,
      seedTargets,
      input.candidateQueries,
      maxSeeds
    );
    const runtimeCompositionRoots = collectRuntimeCompositionRoots(graph, directlyMatchedFiles);
    const scopedFiles = unique([...directlyMatchedFiles, ...runtimeCompositionRoots]);
    return {
      directlyMatchedFiles,
      runtimeCompositionRoots,
      affectedFiles: expandAffectedFiles(graph, scopedFiles, depth, maxFiles),
      blastRadius: buildChangeCampaignBlastRadius(
        graph,
        scopedFiles,
        depth,
        maxFiles,
        this.blastRadiusAnalyzer
      ),
    };
  }
}
