/** Input and result types of the change campaign analysis. */
import { GraphNode } from '../store/types';
import {
  ArchitectureLayer,
  ArchitectureOverview,
  ArchitectureViolation,
} from './ArchitectureInsightService';
import { ChangeTaskMode } from './ChangeContextService';
import { DetectedPattern } from './PatternDetectionAnalyzer';
import { SecurityFinding } from './SecurityScanner';
import { DecompositionGuidance } from './DecompositionGuidanceService';
import { QualityBudget, QualityDashboard, RefactoringWave } from './QualityGovernanceService';

/**
 * Request for a change campaign: the user's words and the queries derived from them, optional seed
 * node ids, task mode, traversal depth and limits on seeds and files, and whether to include
 * security findings.
 */
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

/**
 * The campaign result an agent works from: scope, architecture and blast radius views, relevant
 * patterns and security findings, quality budget, decomposition guidance, an execution plan in
 * waves, risks and next steps.
 */
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
