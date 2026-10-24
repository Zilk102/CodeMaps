import type { GraphData, GraphNode } from '../store/types';
import type {
  ArchitectureNodeClassification,
  ArchitectureOverview,
  ArchitectureViolation,
} from './ArchitectureInsightService';
import type { ChangeCampaignResult, PrepareChangeCampaignInput } from './changeCampaignTypes';
import type { ChangeTaskMode } from './ChangeContextService';
import type { DecompositionGuidance } from './DecompositionGuidanceService';
import type { DetectedPattern } from './PatternDetectionAnalyzer';
import type { QualityGovernanceService } from './QualityGovernanceService';
import type { SecurityFinding } from './SecurityScanner';
import { createGraphSummary } from './AgentContextUtils';
import type { buildQualityArtifacts } from './contextSupport';
import {
  buildCampaignSecurityView,
  buildChangeCampaignNextSteps,
  buildChangeCampaignRisks,
  buildExecutionWaves,
  buildLayersInvolved,
  getCampaignBreadth,
} from './changeCampaignSupport';

export interface CampaignFileScope {
  directlyMatchedFiles: GraphNode[];
  runtimeCompositionRoots: GraphNode[];
  affectedFiles: GraphNode[];
  blastRadius: ChangeCampaignResult['blastRadius'];
}

export interface CampaignAssemblyContext {
  graph: GraphData;
  input: PrepareChangeCampaignInput;
  taskMode: ChangeTaskMode;
  architecture: ArchitectureOverview;
  layerByNodeId: Map<string, ArchitectureNodeClassification>;
  seedTargets: GraphNode[];
  scope: CampaignFileScope;
  campaignViolations: ArchitectureViolation[];
  patterns: DetectedPattern[];
  securityFindings: SecurityFinding[];
  decompositionGuidance: DecompositionGuidance;
  quality: ReturnType<typeof buildQualityArtifacts>;
  qualityGovernanceService: Pick<QualityGovernanceService, 'summarizeBudgetForStep'>;
}

function buildScope(ctx: CampaignAssemblyContext): ChangeCampaignResult['scope'] {
  const { directlyMatchedFiles, runtimeCompositionRoots, affectedFiles } = ctx.scope;
  return {
    candidateQueries: ctx.input.candidateQueries,
    seedTargets: ctx.seedTargets,
    directlyMatchedFiles,
    runtimeCompositionRoots,
    affectedFiles,
    breadth: getCampaignBreadth(affectedFiles.length),
  };
}

function buildExecutionPlan(
  ctx: CampaignAssemblyContext,
  waves: ChangeCampaignResult['executionPlan']['waves']
): ChangeCampaignResult['executionPlan'] {
  const { directlyMatchedFiles, runtimeCompositionRoots } = ctx.scope;
  return {
    preferredExecutionMode: 'multi_target_campaign',
    waves,
    refactoringWaves: ctx.quality.refactoringWaves,
    shouldFallbackToLowLevelTools:
      directlyMatchedFiles.length === 0 && runtimeCompositionRoots.length === 0,
  };
}

export function assembleCampaignResult(ctx: CampaignAssemblyContext): ChangeCampaignResult {
  const { graph, input, taskMode, architecture, layerByNodeId, scope } = ctx;
  const { directlyMatchedFiles, runtimeCompositionRoots, affectedFiles } = scope;
  const { qualityBudget, qualityDashboard, refactoringWaves } = ctx.quality;
  const layersInvolved = buildLayersInvolved(affectedFiles, layerByNodeId);
  const waves = buildExecutionWaves(affectedFiles, layerByNodeId, runtimeCompositionRoots);

  return {
    graphSummary: createGraphSummary(graph),
    taskMode,
    userRequest: input.userRequest,
    scope: buildScope(ctx),
    architecture: {
      summary: architecture.summary,
      layersInvolved,
      campaignViolations: ctx.campaignViolations,
    },
    blastRadius: scope.blastRadius,
    patterns: ctx.patterns,
    security: buildCampaignSecurityView(ctx.securityFindings),
    qualityBudget,
    qualityDashboard,
    decompositionGuidance: ctx.decompositionGuidance,
    executionPlan: buildExecutionPlan(ctx, waves),
    risks: buildChangeCampaignRisks(
      affectedFiles,
      runtimeCompositionRoots,
      layersInvolved,
      ctx.campaignViolations,
      ctx.patterns,
      ctx.securityFindings
    ),
    nextSteps: buildChangeCampaignNextSteps({
      taskMode,
      directlyMatchedFiles,
      affectedFiles,
      runtimeCompositionRoots,
      waves,
      hasSecurityFindings: ctx.securityFindings.length > 0,
      qualityBudget,
      refactoringWaves,
      qualityGovernanceService: ctx.qualityGovernanceService,
    }),
  };
}
