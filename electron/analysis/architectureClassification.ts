import { GraphData, GraphNode } from '../store';
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

export const refineDirectoryClassifications = (
  graph: GraphData,
  initialClassifications: ArchitectureNodeClassification[],
  childrenByParentId: Map<string, GraphNode[]>
) => {
  const nodeById = new Map(graph.nodes.map((node) => [node.id, node]));
  const initialByNodeId = new Map(initialClassifications.map((record) => [record.nodeId, record]));
  const descendantVotesByNodeId = new Map<string, Map<ArchitectureLayer, number>>();

  const collectDescendantVotes = (nodeId: string, visited = new Set<string>()) => {
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

  return graph.nodes.map((node) => {
    const base = initialByNodeId.get(node.id) || createUnknownClassification(node.id);
    if (
      node.type !== 'directory' ||
      base.layer !== 'unknown' ||
      node.id === graph.projectRoot ||
      !nodeById.has(node.id)
    ) {
      return base;
    }

    const descendantVotes = collectDescendantVotes(node.id);
    if (!shouldPromoteDirectory(descendantVotes)) {
      return base;
    }

    const dominant = Array.from(descendantVotes.entries()).sort(
      (a, b) => b[1] - a[1] || a[0].localeCompare(b[0])
    )[0];

    if (!dominant) {
      return base;
    }

    return {
      nodeId: node.id,
      layer: dominant[0],
      reason: 'dominant_descendant_layer',
    };
  });
};
