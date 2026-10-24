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

export interface PrepareChangeContextInput {
  target: string;
  changeIntent?: string;
  type?: string;
  depth?: number;
  includeSecurityFindings?: boolean;
  taskMode?: ChangeTaskMode;
}

export interface ResolvedTargetContext {
  query: string;
  exactMatch: boolean;
  node: GraphNode;
  alternatives: GraphNode[];
  resolutionReason: string;
}

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

export interface ChangeEvidence {
  dependencies: ReturnType<typeof getNodeDependencies>;
  blastRadius: BlastRadiusResult;
  relevantPatterns: DetectedPattern[];
  securityFindings: SecurityFinding[];
  targetViolations: ArchitectureViolation[];
  recommendedFilesToInspect: string[];
  decompositionCandidates: DecompositionCandidate[];
}

export interface ChangeAssemblyContext extends ChangeEvidence {
  taskMode: ChangeTaskMode;
  resolvedTarget: ResolvedTargetContext;
  architecture: ArchitectureOverview;
  targetClassification: ArchitectureNodeClassification;
}
