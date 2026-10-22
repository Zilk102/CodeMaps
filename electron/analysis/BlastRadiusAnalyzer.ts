import { GraphData, GraphLink, GraphNode } from '../store/types';
import {
  buildGraphAdjacency,
  isArchitecturalDependencyLink,
  isStackAwareLink,
} from './graphAnalysisUtils';

export interface BlastRadiusResult {
  rootNodeId: string;
  /** The root plus, for a file, the symbols it declares: imports usually point at those. */
  seedNodeIds?: string[];
  depthLimit: number | null;
  directDependents: GraphNode[];
  affectedNodes: GraphNode[];
  affectedLinks: GraphLink[];
  maxDepth: number;
  confidence: 'high' | 'medium' | 'low';
}

export class BlastRadiusAnalyzer {
  analyze(graph: GraphData, rootNodeId: string, depthLimit?: number): BlastRadiusResult {
    const { nodeById, incomingByTarget } = buildGraphAdjacency(graph);

    // Imports usually name symbols (`file#Name`), so a file is reached through its symbols too.
    const seeds = [rootNodeId];
    if (nodeById.get(rootNodeId)?.type === 'file') {
      for (const node of graph.nodes) {
        if (node.parentId === rootNodeId) seeds.push(node.id);
      }
    }
    const ownIds = new Set(seeds);

    const visited = new Set<string>(seeds);
    const depths = new Map<string, number>(seeds.map((id) => [id, 0]));
    const queue: string[] = [...seeds];
    const affectedLinks: GraphLink[] = [];

    while (queue.length > 0) {
      const current = queue.shift()!;
      const currentDepth = depths.get(current) || 0;
      if (typeof depthLimit === 'number' && currentDepth >= depthLimit) {
        continue;
      }

      for (const dependentLink of incomingByTarget.get(current) || []) {
        if (!isArchitecturalDependencyLink(dependentLink) && dependentLink.type !== 'adr') {
          continue;
        }
        // A file's own symbols referring to each other are not dependents.
        if (ownIds.has(dependentLink.source)) continue;
        affectedLinks.push(dependentLink);
        const nextId = dependentLink.source;
        if (visited.has(nextId)) continue;
        visited.add(nextId);
        depths.set(nextId, currentDepth + 1);
        queue.push(nextId);
      }
    }

    const affectedNodes = Array.from(visited)
      .filter((nodeId) => !ownIds.has(nodeId))
      .map((nodeId) => nodeById.get(nodeId))
      .filter((node): node is GraphNode => Boolean(node));

    const directDependents = seeds
      .flatMap((seed) => incomingByTarget.get(seed) || [])
      .filter((link) => !ownIds.has(link.source))
      .map((link) => nodeById.get(link.source))
      .filter((node): node is GraphNode => Boolean(node));

    const maxDepth = Math.max(0, ...Array.from(depths.values()));
    const confidence = this.computeConfidence(affectedLinks, affectedNodes);

    return {
      rootNodeId,
      seedNodeIds: seeds,
      depthLimit: typeof depthLimit === 'number' ? depthLimit : null,
      directDependents,
      affectedNodes,
      affectedLinks,
      maxDepth,
      confidence,
    };
  }

  private computeConfidence(
    affectedLinks: GraphLink[],
    affectedNodes: GraphNode[]
  ): 'high' | 'medium' | 'low' {
    if (affectedNodes.length === 0) {
      return 'low';
    }

    const importLinks = affectedLinks.filter((link) => link.type === 'import').length;
    const stackAwareLinks = affectedLinks.filter((link) => isStackAwareLink(link)).length;
    const adrLinks = affectedLinks.filter((link) => link.type === 'adr').length;

    if ((importLinks > 0 || stackAwareLinks > 0) && adrLinks === 0) {
      return 'high';
    }

    if (importLinks > 0 || stackAwareLinks > 0) {
      return 'medium';
    }

    return 'low';
  }
}
