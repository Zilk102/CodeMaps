import { GraphData, GraphLink, GraphNode } from '../store';
import {
  ArchitectureInsightService,
  ArchitectureNodeClassification,
  ArchitectureOverview,
  ArchitectureViolation,
} from './ArchitectureInsightService';
import { BlastRadiusAnalyzer, BlastRadiusResult } from './BlastRadiusAnalyzer';
import { DetectedPattern, PatternDetectionAnalyzer } from './PatternDetectionAnalyzer';
import { SecurityFinding, SecurityScanner } from './SecurityScanner';
import {
  DecompositionCandidate,
  DecompositionGuidanceService,
} from './DecompositionGuidanceService';
import { createGraphSummary } from './AgentContextUtils';
import {
  buildBlastRadiusView,
  buildDependenciesView,
  collectRecommendedFilesToInspect,
  collectRelatedNodeIds,
  collectRelevantPatterns,
  collectTargetViolations,
  getNodeDependencies,
  resolveTarget,
} from './changeContextSupport';
import {
  buildChangeAutopilotPlan,
  buildChangeNextSteps,
  buildChangeRisks,
} from './changeContextPolicies';
import {
  ChangeTaskMode,
  collectRelatedSecurityFindings,
  collectStructuralNodeIds,
  normalizeChangeTaskMode,
  resolveTargetClassification,
} from './changeContextRuntimeSupport';

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
      | 'inspect_code'
      | 'review_dependencies'
      | 'check_security'
      | 'verify_architecture';
    shouldFallbackToLowLevelTools: boolean;
  };
  nextSteps: string[];
}

const MAX_RELATED_NODES = 12;
const MAX_RELATED_PATTERNS = 8;
const MAX_RELATED_FINDINGS = 10;

export class ChangeContextService {
  constructor(
    private readonly architectureInsightService = new ArchitectureInsightService(),
    private readonly blastRadiusAnalyzer = new BlastRadiusAnalyzer(),
    private readonly patternDetectionAnalyzer = new PatternDetectionAnalyzer(),
    private readonly securityScanner = new SecurityScanner(),
    private readonly decompositionGuidanceService = new DecompositionGuidanceService()
  ) {}

  async prepareChangeContext(
    graph: GraphData,
    input: PrepareChangeContextInput
  ): Promise<ChangeContextResult> {
    const taskMode = normalizeChangeTaskMode(input.taskMode);
    const resolvedTarget = resolveTarget(graph, input.target, input.type);
    const architecture = this.architectureInsightService.analyze(graph);
    const targetClassification = resolveTargetClassification({
      architecture,
      resolvedTarget,
      graphProjectRoot: graph.projectRoot,
      architectureInsightService: this.architectureInsightService,
    });
    const dependencies = getNodeDependencies(graph, resolvedTarget.node.id);
    const blastRadius = this.blastRadiusAnalyzer.analyze(
      graph,
      resolvedTarget.node.id,
      input.depth
    );
    const relatedNodeIds = collectRelatedNodeIds(resolvedTarget.node.id, dependencies, blastRadius);
    const structuralNodeIds = collectStructuralNodeIds(relatedNodeIds);
    const relevantPatterns = collectRelevantPatterns(
      this.patternDetectionAnalyzer.analyze(graph).patterns,
      relatedNodeIds,
      structuralNodeIds,
      MAX_RELATED_PATTERNS
    );
    const securityFindings = await collectRelatedSecurityFindings({
      graph,
      includeSecurityFindings: input.includeSecurityFindings,
      structuralNodeIds,
      maxFindings: MAX_RELATED_FINDINGS,
      securityScanner: this.securityScanner,
    });

    const targetViolations = collectTargetViolations(architecture, resolvedTarget.node.id);
    const recommendedFilesToInspect = collectRecommendedFilesToInspect(
      resolvedTarget.node.id,
      dependencies,
      blastRadius
    );
    const decompositionCandidates = this.decompositionGuidanceService.prepareGuidance(graph, {
      limit: 8,
      focusNodeIds: Array.from(structuralNodeIds),
    }).candidates;

    return {
      graphSummary: createGraphSummary(graph),
      taskMode,
      target: resolvedTarget,
      changeIntent: input.changeIntent || null,
      targetClassification,
      architecture: {
        summary: architecture.summary,
        dominantLayerDependencies: architecture.dependencies.slice(0, 10),
        targetViolations,
      },
      dependencies: buildDependenciesView(dependencies, MAX_RELATED_NODES),
      blastRadius: buildBlastRadiusView(blastRadius, MAX_RELATED_NODES),
      relevantPatterns,
      relatedSecurityFindings: securityFindings,
      recommendedFilesToInspect,
      decompositionCandidates,
      autopilotPlan: buildChangeAutopilotPlan({
        taskMode,
        changeIntent: input.changeIntent,
        resolvedTarget,
        targetClassification,
        blastRadius,
        runtimeContractLinks: dependencies.runtimeContractLinks,
        contractBindingLinks: dependencies.contractBindingLinks,
        securityFindings,
      }),
      risks: buildChangeRisks({
        target: resolvedTarget.node,
        targetClassification,
        blastRadius,
        runtimeContractNodes: dependencies.runtimeContractNodes,
        contractBindingNodes: dependencies.contractBindingNodes,
        targetViolations,
        relevantPatterns,
        securityFindings,
      }),
      nextSteps: buildChangeNextSteps({
        changeIntent: input.changeIntent,
        target: resolvedTarget.node,
        targetClassification,
        recommendedFilesToInspect,
        blastRadius,
        runtimeContractNodes: dependencies.runtimeContractNodes,
        contractBindingNodes: dependencies.contractBindingNodes,
        securityFindings,
        decompositionCandidates,
      }),
    };
  }
}
