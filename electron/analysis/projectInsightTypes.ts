/** Types of the project overview: the request and the result returned to the agent. */

import { GraphNode } from '../store/types';
import { ArchitectureOverview } from './ArchitectureInsightService';
import { DetectedPattern } from './PatternDetectionAnalyzer';
import { HealthScoreResult } from './HealthScoreAnalyzer';
import { DetectedStack } from './StackInsightService';
import { StackStructuralInsight } from './StackTopologyService';
import { SecurityFinding } from './SecurityScanner';
import { DecompositionGuidance } from './DecompositionGuidanceService';
import { QualityBudget, QualityDashboard, RefactoringWave } from './QualityGovernanceService';

/**
 * Options for the project overview: whether to run the security scan and to include per-node
 * classifications, and the size of the lists (default 10).
 */
export interface PrepareProjectContextInput {
  includeSecurityFindings?: boolean;
  includeClassifications?: boolean;
  limit?: number;
}

/**
 * The project overview: profile, architecture, health, refresh telemetry, patterns, security, a
 * mental model to start from, the autopilot plan, quality budget and dashboard, decomposition
 * guidance, refactoring waves and next steps.
 */
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
        'no_stack_impact' | 'directory_structure_changed' | 'stack_runtime_path_changed' | null;
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
