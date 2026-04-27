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
  createGraphSummary,
  promoteCodeTarget,
  searchGraph,
  toStructuralNodeId,
  unique,
} from './AgentContextUtils';

export type ChangeTaskMode = 'bugfix' | 'feature' | 'refactor' | 'explore';

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

const MAX_ALTERNATIVES = 5;
const MAX_RELATED_NODES = 12;
const MAX_RELATED_PATTERNS = 8;
const MAX_RELATED_FINDINGS = 10;
const CHANGE_TASK_MODES: ChangeTaskMode[] = ['bugfix', 'feature', 'refactor', 'explore'];

export class ChangeContextService {
  constructor(
    private readonly architectureInsightService = new ArchitectureInsightService(),
    private readonly blastRadiusAnalyzer = new BlastRadiusAnalyzer(),
    private readonly patternDetectionAnalyzer = new PatternDetectionAnalyzer(),
    private readonly securityScanner = new SecurityScanner()
  ) {}

  async prepareChangeContext(
    graph: GraphData,
    input: PrepareChangeContextInput
  ): Promise<ChangeContextResult> {
    const taskMode = this.normalizeChangeTaskMode(input.taskMode);
    const resolvedTarget = this.resolveTarget(graph, input.target, input.type);
    const architecture = this.architectureInsightService.analyze(graph);
    const targetClassification =
      architecture.classifications.find((record) => record.nodeId === resolvedTarget.node.id) ||
      this.architectureInsightService.classifyNode(
        resolvedTarget.node,
        this.architectureInsightService.getActiveRules(graph.projectRoot)
      );
    const dependencies = this.getNodeDependencies(graph, resolvedTarget.node.id);
    const blastRadius = this.blastRadiusAnalyzer.analyze(
      graph,
      resolvedTarget.node.id,
      input.depth
    );
    const patternResult = this.patternDetectionAnalyzer.analyze(graph);
    const relatedNodeIds = new Set<string>([
      resolvedTarget.node.id,
      ...dependencies.outgoingNodes.map((node) => node.id),
      ...dependencies.incomingNodes.map((node) => node.id),
      ...blastRadius.directDependents.map((node) => node.id),
      ...blastRadius.affectedNodes.map((node) => node.id),
    ]);
    const structuralNodeIds = new Set(
      Array.from(relatedNodeIds, (nodeId) => toStructuralNodeId(nodeId))
    );
    const relevantPatterns = patternResult.patterns
      .filter((pattern) =>
        pattern.nodeIds.some(
          (nodeId) =>
            relatedNodeIds.has(nodeId) || structuralNodeIds.has(toStructuralNodeId(nodeId))
        )
      )
      .slice(0, MAX_RELATED_PATTERNS);
    const securityFindings =
      input.includeSecurityFindings === false
        ? []
        : (await this.securityScanner.analyze(graph)).findings
            .filter((finding) => structuralNodeIds.has(toStructuralNodeId(finding.nodeId)))
            .slice(0, MAX_RELATED_FINDINGS);

    const targetViolations = architecture.violations.filter(
      (violation) =>
        toStructuralNodeId(violation.sourceId) === toStructuralNodeId(resolvedTarget.node.id) ||
        toStructuralNodeId(violation.targetId) === toStructuralNodeId(resolvedTarget.node.id)
    );

    const recommendedFilesToInspect = unique([
      toStructuralNodeId(resolvedTarget.node.id),
      ...dependencies.outgoingNodes.map((node) => toStructuralNodeId(node.id)),
      ...dependencies.incomingNodes.map((node) => toStructuralNodeId(node.id)),
      ...blastRadius.directDependents.map((node) => toStructuralNodeId(node.id)),
      ...blastRadius.affectedNodes.map((node) => toStructuralNodeId(node.id)),
    ]).slice(0, 15);

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
      dependencies: {
        outgoingLinks: dependencies.outgoingLinks.slice(0, MAX_RELATED_NODES),
        incomingLinks: dependencies.incomingLinks.slice(0, MAX_RELATED_NODES),
        outgoingNodes: dependencies.outgoingNodes.slice(0, MAX_RELATED_NODES),
        incomingNodes: dependencies.incomingNodes.slice(0, MAX_RELATED_NODES),
        relatedAdrNodes: dependencies.relatedAdrNodes.slice(0, MAX_RELATED_NODES),
      },
      blastRadius: {
        summary: {
          rootNodeId: blastRadius.rootNodeId,
          depthLimit: blastRadius.depthLimit,
          maxDepth: blastRadius.maxDepth,
          confidence: blastRadius.confidence,
        },
        directDependents: blastRadius.directDependents.slice(0, MAX_RELATED_NODES),
        affectedNodes: blastRadius.affectedNodes.slice(0, MAX_RELATED_NODES),
        affectedLinksCount: blastRadius.affectedLinks.length,
      },
      relevantPatterns,
      relatedSecurityFindings: securityFindings,
      recommendedFilesToInspect,
      autopilotPlan: this.buildChangeAutopilotPlan({
        taskMode,
        changeIntent: input.changeIntent,
        resolvedTarget,
        targetClassification,
        blastRadius,
        securityFindings,
      }),
      risks: this.buildChangeRisks({
        target: resolvedTarget.node,
        targetClassification,
        blastRadius,
        targetViolations,
        relevantPatterns,
        securityFindings,
      }),
      nextSteps: this.buildChangeNextSteps({
        changeIntent: input.changeIntent,
        target: resolvedTarget.node,
        targetClassification,
        recommendedFilesToInspect,
        blastRadius,
        securityFindings,
      }),
    };
  }

  private resolveTarget(graph: GraphData, query: string, type?: string): ResolvedTargetContext {
    const normalizedQuery = query.trim().toLowerCase();
    const exactIdMatch = graph.nodes.find(
      (node) => node.id.toLowerCase() === normalizedQuery && (!type || node.type === type)
    );
    if (exactIdMatch) {
      return {
        query,
        exactMatch: true,
        node: exactIdMatch,
        alternatives: [],
        resolutionReason: 'exact_id_match',
      };
    }

    const matches = searchGraph(graph, query, type, MAX_ALTERNATIVES + 1);
    if (matches.length === 0) {
      throw new Error(`Node not found for query: ${query}`);
    }

    const promotedMatch = promoteCodeTarget(matches, normalizedQuery);
    if (promotedMatch) {
      const remaining = matches.filter((node) => node.id !== promotedMatch.id);
      matches.splice(0, matches.length, promotedMatch, ...remaining);
    }

    const exactMatch = this.isExactNodeMatch(matches[0], normalizedQuery);
    return {
      query,
      exactMatch,
      node: matches[0],
      alternatives: matches.slice(1, MAX_ALTERNATIVES + 1),
      resolutionReason: this.describeMatchReason(matches[0], normalizedQuery),
    };
  }

  private getNodeDependencies(graph: GraphData, nodeId: string) {
    const nodeById = new Map(graph.nodes.map((node) => [node.id, node]));
    const outgoingLinks = graph.links.filter((link) => link.source === nodeId);
    const incomingLinks = graph.links.filter((link) => link.target === nodeId);
    const outgoingNodes = outgoingLinks
      .map((link) => nodeById.get(link.target))
      .filter((node): node is GraphNode => Boolean(node));
    const incomingNodes = incomingLinks
      .map((link) => nodeById.get(link.source))
      .filter((node): node is GraphNode => Boolean(node));
    const relatedAdrNodes = graph.links
      .filter(
        (link) =>
          link.type === 'adr' &&
          (link.source === nodeId ||
            link.target === nodeId ||
            toStructuralNodeId(link.source) === toStructuralNodeId(nodeId))
      )
      .flatMap((link) => [nodeById.get(link.source), nodeById.get(link.target)])
      .filter((node): node is GraphNode => node !== undefined && node.type === 'adr');

    return {
      outgoingLinks,
      incomingLinks,
      outgoingNodes,
      incomingNodes,
      relatedAdrNodes: unique(relatedAdrNodes),
    };
  }

  private buildChangeAutopilotPlan(args: {
    taskMode: ChangeTaskMode;
    changeIntent?: string;
    resolvedTarget: ResolvedTargetContext;
    targetClassification: ArchitectureNodeClassification;
    blastRadius: BlastRadiusResult;
    securityFindings: SecurityFinding[];
  }): ChangeContextResult['autopilotPlan'] {
    const targetKind = `${args.resolvedTarget.node.type}:${args.resolvedTarget.node.label}`;
    const preferredNextAction: ChangeContextResult['autopilotPlan']['preferredNextAction'] =
      args.securityFindings.length > 0
        ? 'check_security'
        : args.blastRadius.affectedNodes.length > 0
          ? 'review_dependencies'
          : args.targetClassification.layer === 'shared' ||
              args.targetClassification.layer === 'domain'
            ? 'verify_architecture'
            : 'inspect_code';

    return {
      primaryGoal: args.changeIntent || this.describeChangeModeGoal(args.taskMode),
      whyThisTarget:
        args.resolvedTarget.resolutionReason === 'exact_id_match'
          ? `${targetKind} selected because it is an exact match.`
          : `${targetKind} selected due to ${args.resolvedTarget.resolutionReason}.`,
      preferredNextAction,
      shouldFallbackToLowLevelTools:
        args.resolvedTarget.alternatives.length > 0 && !args.resolvedTarget.exactMatch,
    };
  }

  private buildChangeRisks(args: {
    target: GraphNode;
    targetClassification: ArchitectureNodeClassification;
    blastRadius: BlastRadiusResult;
    targetViolations: ArchitectureViolation[];
    relevantPatterns: DetectedPattern[];
    securityFindings: SecurityFinding[];
  }) {
    const risks: string[] = [];

    if (args.blastRadius.confidence === 'high' && args.blastRadius.affectedNodes.length > 0) {
      risks.push(
        `The change has a confirmed impact on ${args.blastRadius.affectedNodes.length} dependent nodes.`
      );
    }

    if (args.targetViolations.length > 0) {
      risks.push(
        'The target area is already involved in layer violations; a local fix may solidify the architectural smell.'
      );
    }

    if (
      args.relevantPatterns.some(
        (pattern) => pattern.id === 'hub_nodes' || pattern.id === 'high_fan_out_files'
      )
    ) {
      risks.push(
        'The target lies near high-coupling hotspot nodes; caution is needed with new dependencies.'
      );
    }

    if (args.securityFindings.length > 0) {
      risks.push(
        'There are already security findings in adjacent files; the change must be verified against data and API security.'
      );
    }

    if (
      args.targetClassification.layer === 'shared' ||
      args.targetClassification.layer === 'domain'
    ) {
      risks.push(
        `The target is in the ${args.targetClassification.layer} layer, so the blast radius may extend far beyond the local module.`
      );
    }

    if (risks.length === 0) {
      risks.push(
        'No obvious structural red flags found, but still verify runtime contracts and reverse dependencies.'
      );
    }

    return risks;
  }

  private buildChangeNextSteps(args: {
    changeIntent?: string;
    target: GraphNode;
    targetClassification: ArchitectureNodeClassification;
    recommendedFilesToInspect: string[];
    blastRadius: BlastRadiusResult;
    securityFindings: SecurityFinding[];
  }) {
    const nextSteps = [
      `First, re-read the target node ${args.target.id} and the closest files from recommendedFilesToInspect.`,
      'Check if the change creates new layer violations or unnecessary import edges.',
    ];

    if (args.changeIntent) {
      nextSteps.unshift(`Clarify change intent: ${args.changeIntent}.`);
    }

    if (args.blastRadius.affectedNodes.length > 0) {
      nextSteps.push(
        'After editing, double-check the affected nodes from the blast radius and ensure contracts have not degraded.'
      );
    }

    if (args.securityFindings.length > 0) {
      nextSteps.push(
        'Separately re-verify safe handling of secrets, shell/process APIs, and browser storage.'
      );
    }

    if (
      args.targetClassification.layer === 'application' ||
      args.targetClassification.layer === 'integration'
    ) {
      nextSteps.push(
        'Ensure that orchestration/integration code does not start pulling presentation details or extra state.'
      );
    }

    return nextSteps;
  }

  private normalizeChangeTaskMode(taskMode?: ChangeTaskMode): ChangeTaskMode {
    return CHANGE_TASK_MODES.includes(taskMode || 'bugfix') ? taskMode || 'bugfix' : 'bugfix';
  }

  private isExactNodeMatch(node: GraphNode, normalizedQuery: string) {
    const normalizedLabel = node.label.toLowerCase();
    const structuralId = toStructuralNodeId(node.id.toLowerCase());
    const basename = structuralId.split('/').pop() || structuralId;
    const basenameWithoutExtension = basename.replace(/\.[^.]+$/u, '');
    return (
      normalizedLabel === normalizedQuery ||
      basename === normalizedQuery ||
      basenameWithoutExtension === normalizedQuery
    );
  }

  private describeMatchReason(node: GraphNode, normalizedQuery: string) {
    const normalizedLabel = node.label.toLowerCase();
    const structuralId = toStructuralNodeId(node.id.toLowerCase());
    const basename = structuralId.split('/').pop() || structuralId;
    const basenameWithoutExtension = basename.replace(/\.[^.]+$/u, '');

    if (basenameWithoutExtension === normalizedQuery) {
      return 'basename_without_extension_match';
    }
    if (basename === normalizedQuery) {
      return 'basename_match';
    }
    if (normalizedLabel === normalizedQuery) {
      return 'label_match';
    }
    if (normalizedLabel.startsWith(normalizedQuery)) {
      return 'label_prefix_match';
    }
    return 'fuzzy_graph_match';
  }

  private describeChangeModeGoal(taskMode: ChangeTaskMode) {
    switch (taskMode) {
      case 'feature':
        return 'Find a safe integration point for new functionality.';
      case 'refactor':
        return 'Modify the structure without regressing dependencies and layers.';
      case 'explore':
        return 'Understand the scope of changes and gather minimally sufficient context.';
      case 'bugfix':
      default:
        return 'Find and fix the defect with minimal blast radius.';
    }
  }
}
