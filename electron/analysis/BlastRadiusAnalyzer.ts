import { GraphData, GraphLink, GraphNode } from '../store';
import { buildGraphAdjacency } from './graphAnalysisUtils';

export interface BlastRadiusResult {
  rootNodeId: string;
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

    const visited = new Set<string>([rootNodeId]);
    const depths = new Map<string, number>([[rootNodeId, 0]]);
    const queue: string[] = [rootNodeId];
    const affectedLinks: GraphLink[] = [];

    while (queue.length > 0) {
      const current = queue.shift()!;
      const currentDepth = depths.get(current) || 0;
      if (typeof depthLimit === 'number' && currentDepth >= depthLimit) {
        continue;
      }

      for (const dependentLink of incomingByTarget.get(current) || []) {
        affectedLinks.push(dependentLink);
        const nextId = dependentLink.source;
        if (visited.has(nextId)) continue;
        visited.add(nextId);
        depths.set(nextId, currentDepth + 1);
        queue.push(nextId);
      }
    }

    const affectedNodes = Array.from(visited)
      .filter((nodeId) => nodeId !== rootNodeId)
      .map((nodeId) => nodeById.get(nodeId))
      .filter((node): node is GraphNode => Boolean(node));

    const directDependents = (incomingByTarget.get(rootNodeId) || [])
      .map((link) => nodeById.get(link.source))
      .filter((node): node is GraphNode => Boolean(node));

    const maxDepth = Math.max(0, ...Array.from(depths.values()));
    const confidence = this.computeConfidence(affectedLinks, affectedNodes);

    return {
      rootNodeId,
      depthLimit: typeof depthLimit === 'number' ? depthLimit : null,
      directDependents,
      affectedNodes,
      affectedLinks,
      maxDepth,
      confidence,
    };
  }

  private computeConfidence(affectedLinks: GraphLink[], affectedNodes: GraphNode[]): 'high' | 'medium' | 'low' {
    if (affectedNodes.length === 0) {
      return 'low';
    }

    const importLinks = affectedLinks.filter((link) => link.type === 'import').length;
    const adrLinks = affectedLinks.filter((link) => link.type === 'adr').length;

    if (importLinks > 0 && adrLinks === 0) {
      return 'high';
    }

    if (importLinks > 0) {
      return 'medium';
    }

    return 'low';
  }
}
