/**
 * Graph queries behind the change context: resolving the target node and gathering its
 * dependencies, related nodes and views for the result.
 */
import { GraphData, GraphLink, GraphNode } from '../store/types';
import type { ArchitectureOverview } from './ArchitectureInsightService';
import type { BlastRadiusResult } from './BlastRadiusAnalyzer';
import { promoteCodeTarget, searchGraph, toStructuralNodeId, unique } from './AgentContextUtils';
import { isContractSemanticLink, isDiRuntimeLink } from './graphAnalysisUtils';
import type { DetectedPattern } from './PatternDetectionAnalyzer';
import type { ChangeContextResult, ResolvedTargetContext } from './ChangeContextService';

const MAX_ALTERNATIVES = 5;

/**
 * Everything directly connected to a change target: its own links and neighbours, DI runtime and
 * API contract links, and related ADR nodes.
 */
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

/**
 * Finds the node a free-text query refers to. An exact id match wins; otherwise graph search
 * results are used (a code node is preferred over a directory) with up to 5 alternatives, and the
 * reason for the choice is recorded. Throws when nothing matches.
 */
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

const definedNodes = (nodes: Array<GraphNode | undefined>): GraphNode[] =>
  nodes.filter((node): node is GraphNode => Boolean(node));

/**
 * Collects the links around a node: direct incoming and outgoing links, DI runtime and
 * contract-binding links that touch its file (reported through their file-level endpoints), and
 * ADR nodes linked to it.
 */
export function getNodeDependencies(graph: GraphData, nodeId: string): ChangeNodeDependencies {
  const nodeById = new Map(graph.nodes.map((node) => [node.id, node]));
  const outgoingLinks = graph.links.filter((link) => link.source === nodeId);
  const incomingLinks = graph.links.filter((link) => link.target === nodeId);
  const structuralNodeId = toStructuralNodeId(nodeId);
  const touchesTarget = (link: GraphLink) =>
    toStructuralNodeId(link.source) === structuralNodeId ||
    toStructuralNodeId(link.target) === structuralNodeId;
  const runtimeContractLinks = graph.links.filter(
    (link) => isDiRuntimeLink(link) && touchesTarget(link)
  );
  const contractBindingLinks = graph.links.filter(
    (link) => isContractSemanticLink(link) && touchesTarget(link)
  );
  const outgoingNodes = definedNodes(outgoingLinks.map((link) => nodeById.get(link.target)));
  const incomingNodes = definedNodes(incomingLinks.map((link) => nodeById.get(link.source)));
  const structuralEndpoints = (links: GraphLink[]) =>
    definedNodes(
      links.flatMap((link) => [
        nodeById.get(toStructuralNodeId(link.source)),
        nodeById.get(toStructuralNodeId(link.target)),
      ])
    );
  const runtimeContractNodes = structuralEndpoints(runtimeContractLinks);
  const contractBindingNodes = structuralEndpoints(contractBindingLinks);
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

/**
 * Ids of every node connected to the target through dependencies, runtime contracts or the blast
 * radius, plus the target itself.
 */
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

/**
 * Keeps the patterns that involve any related node (or a node in the same files), at most `limit`.
 */
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

/** Returns the architecture violations whose source or target is in the same file as the node. */
export function collectTargetViolations(architecture: ArchitectureOverview, nodeId: string) {
  const structuralNodeId = toStructuralNodeId(nodeId);
  return architecture.violations.filter(
    (violation) =>
      toStructuralNodeId(violation.sourceId) === structuralNodeId ||
      toStructuralNodeId(violation.targetId) === structuralNodeId
  );
}

/**
 * Lists up to 15 files worth reading before the change: the target's file first, then files of its
 * neighbours, contract nodes and dependents.
 */
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

/** Trims every dependency list to `maxRelatedNodes` entries so the result stays small. */
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

/**
 * Trims the blast radius to a summary, `maxRelatedNodes` dependents and affected nodes and the
 * total number of affected links.
 */
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

/** The lower-cased names a query can match: the label, the file name, and the file name without extension. */
function nodeNameForms(node: GraphNode) {
  const structuralId = toStructuralNodeId(node.id.toLowerCase());
  const basename = structuralId.split('/').pop() || structuralId;
  return {
    normalizedLabel: node.label.toLowerCase(),
    basename,
    basenameWithoutExtension: basename.replace(/\.[^.]+$/u, ''),
  };
}

function isExactNodeMatch(node: GraphNode, normalizedQuery: string) {
  const { normalizedLabel, basename, basenameWithoutExtension } = nodeNameForms(node);
  return (
    normalizedLabel === normalizedQuery ||
    basename === normalizedQuery ||
    basenameWithoutExtension === normalizedQuery
  );
}

/**
 * Names why a node matched a query, from the strongest match (file name without extension) down to
 * 'fuzzy_graph_match'.
 */
function describeMatchReason(node: GraphNode, normalizedQuery: string) {
  const { normalizedLabel, basename, basenameWithoutExtension } = nodeNameForms(node);

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
