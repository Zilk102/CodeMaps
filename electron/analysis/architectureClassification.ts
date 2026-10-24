/**
 * Assigns architectural layers to graph nodes from path rules, then lets directories inherit the
 * layer their descendants vote for.
 */
import { GraphData, GraphNode } from '../store/types';
import { toStructuralNodeId } from './AgentContextUtils';
import {
  ArchitectureNodeClassification,
  ArchitectureRule,
  ArchitectureLayer,
} from './architectureTypes';

const normalizeNodePath = (node: GraphNode) => node.id.replace(/\\/g, '/').toLowerCase();

const createUnknownClassification = (nodeId: string): ArchitectureNodeClassification => ({
  nodeId,
  layer: 'unknown',
  reason: 'no_rule_matched',
});

const incrementLayerCount = (
  counts: Map<ArchitectureLayer, number>,
  layer: ArchitectureLayer,
  increment = 1
) => {
  counts.set(layer, (counts.get(layer) || 0) + increment);
};

const mergeLayerCounts = (
  target: Map<ArchitectureLayer, number>,
  source: Map<ArchitectureLayer, number>
) => {
  for (const [layer, count] of source.entries()) {
    incrementLayerCount(target, layer, count);
  }
};

/**
 * Decides whether a directory takes a layer from its descendants: a single layer always wins,
 * otherwise the top layer needs at least two votes and 40% of all votes.
 */
const shouldPromoteDirectory = (counts: Map<ArchitectureLayer, number>) => {
  if (counts.size === 0) {
    return false;
  }

  const total = Array.from(counts.values()).reduce((sum, count) => sum + count, 0);
  const dominantCount = Math.max(...counts.values());

  if (counts.size === 1) {
    return true;
  }

  return dominantCount >= 2 && dominantCount / total >= 0.4;
};

/**
 * Classifies one node by the first rule whose pattern matches its normalized path (directories are
 * matched with a trailing slash); nodes no rule matches get layer 'unknown'.
 */
export const classifyNodeByRules = (
  node: GraphNode,
  activeRules: ArchitectureRule[]
): ArchitectureNodeClassification => {
  const normalizedPath = normalizeNodePath(node);
  const filePath = toStructuralNodeId(normalizedPath);
  const normalizedTarget = node.type === 'directory' ? `${filePath}/` : filePath;

  for (const rule of activeRules) {
    if (rule.pattern.test(normalizedTarget)) {
      return { nodeId: node.id, layer: rule.layer, reason: rule.reason };
    }
  }

  return createUnknownClassification(node.id);
};

/**
 * Creates a memoized function that counts the layers of all classified descendants of a node. It
 * guards against cycles in the parent-child map by returning an empty vote for an id already being
 * visited.
 */
const createDescendantVoteCollector = (
  initialByNodeId: Map<string, ArchitectureNodeClassification>,
  childrenByParentId: Map<string, GraphNode[]>
) => {
  const descendantVotesByNodeId = new Map<string, Map<ArchitectureLayer, number>>();

  const collectDescendantVotes = (
    nodeId: string,
    visited = new Set<string>()
  ): Map<ArchitectureLayer, number> => {
    const cached = descendantVotesByNodeId.get(nodeId);
    if (cached) {
      return cached;
    }

    if (visited.has(nodeId)) {
      return new Map<ArchitectureLayer, number>();
    }

    const nextVisited = new Set(visited);
    nextVisited.add(nodeId);
    const counts = new Map<ArchitectureLayer, number>();

    for (const child of childrenByParentId.get(nodeId) || []) {
      const childClassification =
        initialByNodeId.get(child.id) || createUnknownClassification(child.id);
      if (childClassification.layer !== 'unknown') {
        incrementLayerCount(counts, childClassification.layer);
      }

      if (child.type === 'directory') {
        mergeLayerCounts(counts, collectDescendantVotes(child.id, nextVisited));
      }
    }

    descendantVotesByNodeId.set(nodeId, counts);
    return counts;
  };

  return collectDescendantVotes;
};

const pickDominantLayer = (votes: Map<ArchitectureLayer, number>) =>
  Array.from(votes.entries()).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0];

/**
 * Whether a node is a directory the rules left unknown, is not the project root and exists in the
 * graph, so it may inherit a layer from its children.
 */
const isRefinableDirectory = (
  graph: GraphData,
  node: GraphNode,
  base: ArchitectureNodeClassification,
  nodeById: Map<string, GraphNode>
) =>
  node.type === 'directory' &&
  base.layer === 'unknown' &&
  node.id !== graph.projectRoot &&
  nodeById.has(node.id);

/**
 * Second pass over all nodes: unknown directories adopt the dominant layer of their descendants
 * (reason 'dominant_descendant_layer'); every other node keeps its rule-based classification. Ties
 * between layers are broken alphabetically.
 */
export const refineDirectoryClassifications = (
  graph: GraphData,
  initialClassifications: ArchitectureNodeClassification[],
  childrenByParentId: Map<string, GraphNode[]>
) => {
  const nodeById = new Map(graph.nodes.map((node) => [node.id, node]));
  const initialByNodeId = new Map(initialClassifications.map((record) => [record.nodeId, record]));
  const collectDescendantVotes = createDescendantVoteCollector(initialByNodeId, childrenByParentId);

  return graph.nodes.map((node): ArchitectureNodeClassification => {
    const base = initialByNodeId.get(node.id) || createUnknownClassification(node.id);
    if (!isRefinableDirectory(graph, node, base, nodeById)) {
      return base;
    }

    const descendantVotes = collectDescendantVotes(node.id);
    if (!shouldPromoteDirectory(descendantVotes)) {
      return base;
    }

    const dominant = pickDominantLayer(descendantVotes);
    return dominant
      ? { nodeId: node.id, layer: dominant[0], reason: 'dominant_descendant_layer' }
      : base;
  });
};
