/**
 * Prepares the context for a change that spans many files: seeds, affected scope, risks and a
 * wave-by-wave plan.
 */
import { GraphData, GraphNode } from '../store/types';
import { BlastRadiusAnalyzer } from './BlastRadiusAnalyzer';
import { DecompositionGuidanceService } from './DecompositionGuidanceService';
import { QualityGovernanceService } from './QualityGovernanceService';
import type { ChangeCampaignResult, PrepareChangeCampaignInput } from './changeCampaignTypes';
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

export type { ChangeCampaignResult, PrepareChangeCampaignInput } from './changeCampaignTypes';

const DEFAULT_MAX_SEEDS = 8;
const DEFAULT_MAX_FILES = 30;

/**
 * Orchestrates a campaign preparation: it gathers analysis snapshots, scope, quality and guidance
 * through its collaborators and hands them to the assembly step.
 */
export class ChangeCampaignService {
  constructor(
    private readonly analysisSnapshotService = new AnalysisSnapshotService(),
    private readonly blastRadiusAnalyzer = new BlastRadiusAnalyzer(),
    private readonly decompositionGuidanceService = new DecompositionGuidanceService(),
    private readonly qualityGovernanceService = new QualityGovernanceService()
  ) {}

  /**
   * Builds the campaign for a request. Defaults: refactor mode, depth 2, 30 files, 8 seeds.
   * Resolves seed targets, expands them into affected files, keeps only patterns, security
   * findings and violations that touch those files, and assembles the result.
   */
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
    const quality = this.buildQuality(graph, health!, patterns, decompositionGuidance);

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

  /**
   * Builds the quality budget, dashboard and refactoring waves for the campaign; wraps
   * `buildQualityArtifacts` with a limit of 4 refactoring waves.
   */
  private buildQuality(
    graph: GraphData,
    health: Parameters<typeof buildQualityArtifacts>[1],
    patterns: Parameters<typeof buildQualityArtifacts>[2],
    decompositionGuidance: Parameters<typeof buildQualityArtifacts>[3]
  ) {
    return buildQualityArtifacts(
      graph,
      health,
      patterns,
      decompositionGuidance,
      this.qualityGovernanceService,
      4
    );
  }

  /**
   * Determines the files in scope: files holding the seeds, the runtime composition roots that
   * wire them, everything reachable within `depth` hops (up to `maxFiles`) and the blast radius of
   * each scoped file.
   */
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
