import { GraphData, GraphLink, GraphNode } from '../store';
import type { ArchitectureOverview } from './ArchitectureInsightService';
import type { BlastRadiusResult } from './BlastRadiusAnalyzer';
import { promoteCodeTarget, searchGraph, toStructuralNodeId, unique } from './AgentContextUtils';
import { isContractSemanticLink, isDiRuntimeLink } from './graphAnalysisUtils';
import type { DetectedPattern } from './PatternDetectionAnalyzer';
import type { ChangeContextResult, ResolvedTargetContext } from './ChangeContextService';

const MAX_ALTERNATIVES = 5;

export interface ChangeNodeDependencies {
  outgoingLinks: GraphLink[];
  incomingLinks: GraphLink[];
  outgoingNodes: GraphNode[];
  incomingNodes: GraphNode[];
  runtimeContractLinks: GraphLink[];
  runtimeContractNodes: GraphNode[];
  contractBindingLinks: GraphLink[];
  contractBindingNodes: GraphNode[];
  relatedAdrNodes: GraphNode[];
}

export function resolveTarget(
  graph: GraphData,
  query: string,
  type?: string
): ResolvedTargetContext {
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

  const exactMatch = isExactNodeMatch(matches[0], normalizedQuery);
  return {
    query,
    exactMatch,
    node: matches[0],
    alternatives: matches.slice(1, MAX_ALTERNATIVES + 1),
    resolutionReason: describeMatchReason(matches[0], normalizedQuery),
  };
}

export function getNodeDependencies(graph: GraphData, nodeId: string): ChangeNodeDependencies {
  const nodeById = new Map(graph.nodes.map((node) => [node.id, node]));
  const outgoingLinks = graph.links.filter((link) => link.source === nodeId);
  const incomingLinks = graph.links.filter((link) => link.target === nodeId);
  const structuralNodeId = toStructuralNodeId(nodeId);
  const runtimeContractLinks = graph.links.filter(
    (link) =>
      isDiRuntimeLink(link) &&
      (toStructuralNodeId(link.source) === structuralNodeId ||
        toStructuralNodeId(link.target) === structuralNodeId)
  );
  const contractBindingLinks = graph.links.filter(
    (link) =>
      isContractSemanticLink(link) &&
      (toStructuralNodeId(link.source) === structuralNodeId ||
        toStructuralNodeId(link.target) === structuralNodeId)
  );
  const outgoingNodes = outgoingLinks
    .map((link) => nodeById.get(link.target))
    .filter((node): node is GraphNode => Boolean(node));
  const incomingNodes = incomingLinks
    .map((link) => nodeById.get(link.source))
    .filter((node): node is GraphNode => Boolean(node));
  const runtimeContractNodes = runtimeContractLinks
    .flatMap((link) => [
      nodeById.get(toStructuralNodeId(link.source)),
      nodeById.get(toStructuralNodeId(link.target)),
    ])
    .filter((node): node is GraphNode => Boolean(node));
  const contractBindingNodes = contractBindingLinks
    .flatMap((link) => [
      nodeById.get(toStructuralNodeId(link.source)),
      nodeById.get(toStructuralNodeId(link.target)),
    ])
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
    runtimeContractLinks,
    runtimeContractNodes: unique(runtimeContractNodes),
    contractBindingLinks,
    contractBindingNodes: unique(contractBindingNodes),
    relatedAdrNodes: unique(relatedAdrNodes),
  };
}

export function collectRelatedNodeIds(
  resolvedTargetNodeId: string,
  dependencies: ChangeNodeDependencies,
  blastRadius: BlastRadiusResult
) {
  return new Set<string>([
    resolvedTargetNodeId,
    ...dependencies.outgoingNodes.map((node) => node.id),
    ...dependencies.incomingNodes.map((node) => node.id),
    ...dependencies.runtimeContractNodes.map((node) => node.id),
    ...dependencies.contractBindingNodes.map((node) => node.id),
    ...blastRadius.directDependents.map((node) => node.id),
    ...blastRadius.affectedNodes.map((node) => node.id),
  ]);
}

export function collectRelevantPatterns(
  patterns: DetectedPattern[],
  relatedNodeIds: Set<string>,
  structuralNodeIds: Set<string>,
  limit: number
) {
  return patterns
    .filter((pattern) =>
      pattern.nodeIds.some(
        (nodeId) => relatedNodeIds.has(nodeId) || structuralNodeIds.has(toStructuralNodeId(nodeId))
      )
    )
    .slice(0, limit);
}

export function collectTargetViolations(architecture: ArchitectureOverview, nodeId: string) {
  const structuralNodeId = toStructuralNodeId(nodeId);
  return architecture.violations.filter(
    (violation) =>
      toStructuralNodeId(violation.sourceId) === structuralNodeId ||
      toStructuralNodeId(violation.targetId) === structuralNodeId
  );
}

export function collectRecommendedFilesToInspect(
  resolvedTargetNodeId: string,
  dependencies: ChangeNodeDependencies,
  blastRadius: BlastRadiusResult
) {
  return unique([
    toStructuralNodeId(resolvedTargetNodeId),
    ...dependencies.outgoingNodes.map((node) => toStructuralNodeId(node.id)),
    ...dependencies.incomingNodes.map((node) => toStructuralNodeId(node.id)),
    ...dependencies.runtimeContractNodes.map((node) => toStructuralNodeId(node.id)),
    ...dependencies.contractBindingNodes.map((node) => toStructuralNodeId(node.id)),
    ...blastRadius.directDependents.map((node) => toStructuralNodeId(node.id)),
    ...blastRadius.affectedNodes.map((node) => toStructuralNodeId(node.id)),
  ]).slice(0, 15);
}

export function buildDependenciesView(
  dependencies: ChangeNodeDependencies,
  maxRelatedNodes: number
): ChangeContextResult['dependencies'] {
  return {
    outgoingLinks: dependencies.outgoingLinks.slice(0, maxRelatedNodes),
    incomingLinks: dependencies.incomingLinks.slice(0, maxRelatedNodes),
    outgoingNodes: dependencies.outgoingNodes.slice(0, maxRelatedNodes),
    incomingNodes: dependencies.incomingNodes.slice(0, maxRelatedNodes),
    runtimeContractLinks: dependencies.runtimeContractLinks.slice(0, maxRelatedNodes),
    runtimeContractNodes: dependencies.runtimeContractNodes.slice(0, maxRelatedNodes),
    contractBindingLinks: dependencies.contractBindingLinks.slice(0, maxRelatedNodes),
    contractBindingNodes: dependencies.contractBindingNodes.slice(0, maxRelatedNodes),
    relatedAdrNodes: dependencies.relatedAdrNodes.slice(0, maxRelatedNodes),
  };
}

export function buildBlastRadiusView(
  blastRadius: BlastRadiusResult,
  maxRelatedNodes: number
): ChangeContextResult['blastRadius'] {
  return {
    summary: {
      rootNodeId: blastRadius.rootNodeId,
      depthLimit: blastRadius.depthLimit,
      maxDepth: blastRadius.maxDepth,
      confidence: blastRadius.confidence,
    },
    directDependents: blastRadius.directDependents.slice(0, maxRelatedNodes),
    affectedNodes: blastRadius.affectedNodes.slice(0, maxRelatedNodes),
    affectedLinksCount: blastRadius.affectedLinks.length,
  };
}

function isExactNodeMatch(node: GraphNode, normalizedQuery: string) {
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

function describeMatchReason(node: GraphNode, normalizedQuery: string) {
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
