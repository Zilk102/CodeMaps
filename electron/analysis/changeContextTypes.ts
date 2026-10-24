/**
 * Types of the change context: the request, the resolved target, the evidence gathered and the
 * result returned to the agent.
 */
import type { GraphLink, GraphNode } from '../store/types';
import type {
  ArchitectureNodeClassification,
  ArchitectureOverview,
  ArchitectureViolation,
} from './ArchitectureInsightService';
import type { BlastRadiusResult } from './BlastRadiusAnalyzer';
import type { DecompositionCandidate } from './DecompositionGuidanceService';
import type { DetectedPattern } from './PatternDetectionAnalyzer';
import type { SecurityFinding } from './SecurityScanner';
import type { getNodeDependencies } from './changeContextSupport';
import type { ChangeTaskMode } from './changeContextRuntimeSupport';

export type { ChangeTaskMode } from './changeContextRuntimeSupport';

/**
 * Request for a change context: the target (a node id or a name to search), optional intent, node
 * type filter, traversal depth, task mode and whether to scan for security findings.
 */
export interface PrepareChangeContextInput {
  target: string;
  changeIntent?: string;
  type?: string;
  depth?: number;
  includeSecurityFindings?: boolean;
  taskMode?: ChangeTaskMode;
}

/**
 * The graph node a request resolved to, with the other candidates and the reason for the choice.
 * `exactMatch` is false when the query only matched approximately.
 */
export interface ResolvedTargetContext {
  query: string;
  exactMatch: boolean;
  node: GraphNode;
  alternatives: GraphNode[];
  resolutionReason: string;
}

/**
 * The change context returned to the agent: the target, its layer and violations, dependencies,
 * blast radius, patterns, security findings, files to inspect, risks, a plan and next steps.
 */
export interface ChangeContextResult {
  graphSummary: {
    projectRoot: string;
    nodesCount: number;
    linksCount: number;
    nodeTypes: Record<string, number>;
  };
  taskMode: ChangeTaskMode;
  target: ResolvedTargetContext;
  changeIntent: string | null;
  targetClassification: ArchitectureNodeClassification;
  architecture: {
    summary: ArchitectureOverview['summary'];
    dominantLayerDependencies: ArchitectureOverview['dependencies'];
    targetViolations: ArchitectureViolation[];
  };
  dependencies: {
    outgoingLinks: GraphLink[];
    incomingLinks: GraphLink[];
    outgoingNodes: GraphNode[];
    incomingNodes: GraphNode[];
    runtimeContractLinks: GraphLink[];
    runtimeContractNodes: GraphNode[];
    contractBindingLinks: GraphLink[];
    contractBindingNodes: GraphNode[];
    relatedAdrNodes: GraphNode[];
  };
  blastRadius: {
    summary: Pick<BlastRadiusResult, 'rootNodeId' | 'depthLimit' | 'maxDepth' | 'confidence'>;
    directDependents: GraphNode[];
    affectedNodes: GraphNode[];
    affectedLinksCount: number;
  };
  relevantPatterns: DetectedPattern[];
  relatedSecurityFindings: SecurityFinding[];
  recommendedFilesToInspect: string[];
  decompositionCandidates: DecompositionCandidate[];
  risks: string[];
  autopilotPlan: {
    primaryGoal: string;
    whyThisTarget: string;
    preferredNextAction:
      'inspect_code' | 'review_dependencies' | 'check_security' | 'verify_architecture';
    shouldFallbackToLowLevelTools: boolean;
  };
  nextSteps: string[];
}

/** Evidence collected around the target, before it is turned into the final result. */
export interface ChangeEvidence {
  dependencies: ReturnType<typeof getNodeDependencies>;
  blastRadius: BlastRadiusResult;
  relevantPatterns: DetectedPattern[];
  securityFindings: SecurityFinding[];
  targetViolations: ArchitectureViolation[];
  recommendedFilesToInspect: string[];
  decompositionCandidates: DecompositionCandidate[];
}

/**
 * The full input of result assembly: the collected evidence plus the task mode, the resolved
 * target and its architecture data.
 */
export interface ChangeAssemblyContext extends ChangeEvidence {
  taskMode: ChangeTaskMode;
  resolvedTarget: ResolvedTargetContext;
  architecture: ArchitectureOverview;
  targetClassification: ArchitectureNodeClassification;
}
