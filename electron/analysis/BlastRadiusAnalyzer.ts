/** Computes the blast radius of a node: everything that directly or transitively depends on it. */
import { GraphData, GraphLink, GraphNode } from '../store/types';
import {
  buildGraphAdjacency,
  isArchitecturalDependencyLink,
  isStackAwareLink,
} from './graphAnalysisUtils';

/**
 * Result of a blast radius run. `affectedNodes` excludes the seed nodes themselves;
 * `directDependents` are nodes with a link straight into a seed; `depthLimit` is null when
 * unbounded; `maxDepth` is the deepest level reached.
 */
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

/** Walks dependency links backwards from a node to find the code that a change to it can break. */
export class BlastRadiusAnalyzer {
  /**
   * Breadth-first search over reverse dependency links starting at the root (for a file also its
   * symbols). Stops expanding at `depthLimit` when given; the seeds' own links are never counted
   * as dependents. Confidence reflects the kind of links found.
   */
  analyze(graph: GraphData, rootNodeId: string, depthLimit?: number): BlastRadiusResult {
    const { nodeById, incomingByTarget } = buildGraphAdjacency(graph);
    const seeds = this.collectSeeds(graph, rootNodeId, nodeById);
    const ownIds = new Set(seeds);
    const { visited, depths, affectedLinks } = this.traverseDependents(
      seeds,
      ownIds,
      incomingByTarget,
      depthLimit
    );

    const affectedNodes = Array.from(visited)
      .filter((nodeId) => !ownIds.has(nodeId))
      .map((nodeId) => nodeById.get(nodeId))
      .filter((node): node is GraphNode => Boolean(node));

    const directDependents = seeds
      .flatMap((seed) => incomingByTarget.get(seed) || [])
      .filter((link) => !ownIds.has(link.source))
      .map((link) => nodeById.get(link.source))
      .filter((node): node is GraphNode => Boolean(node));

    return {
      rootNodeId,
      seedNodeIds: seeds,
      depthLimit: typeof depthLimit === 'number' ? depthLimit : null,
      directDependents,
      affectedNodes,
      affectedLinks,
      maxDepth: Math.max(0, ...Array.from(depths.values())),
      confidence: this.computeConfidence(affectedLinks, affectedNodes),
    };
  }

  /** Imports usually name symbols (`file#Name`), so a file is reached through its symbols too. */
  private collectSeeds(
    graph: GraphData,
    rootNodeId: string,
    nodeById: Map<string, GraphNode>
  ): string[] {
    const seeds = [rootNodeId];
    if (nodeById.get(rootNodeId)?.type === 'file') {
      for (const node of graph.nodes) {
        if (node.parentId === rootNodeId) seeds.push(node.id);
      }
    }
    return seeds;
  }

  /**
   * Breadth-first walk from the seeds along incoming dependency links, recording the depth of each
   * node and every link crossed. A node is expanded once, but all its links are recorded; nodes at
   * `depthLimit` are not expanded further.
   */
  private traverseDependents(
    seeds: string[],
    ownIds: Set<string>,
    incomingByTarget: Map<string, GraphLink[]>,
    depthLimit?: number
  ) {
    const visited = new Set<string>(seeds);
    const depths = new Map<string, number>(seeds.map((id) => [id, 0]));
    const queue: string[] = [...seeds];
    const affectedLinks: GraphLink[] = [];

    while (queue.length > 0) {
      const current = queue.shift()!;
      const currentDepth = depths.get(current) || 0;
      if (typeof depthLimit === 'number' && currentDepth >= depthLimit) continue;

      for (const dependentLink of this.dependentLinksOf(current, ownIds, incomingByTarget)) {
        affectedLinks.push(dependentLink);
        const nextId = dependentLink.source;
        if (visited.has(nextId)) continue;
        visited.add(nextId);
        depths.set(nextId, currentDepth + 1);
        queue.push(nextId);
      }
    }

    return { visited, depths, affectedLinks };
  }

  /** A file's own symbols referring to each other are not dependents. */
  private dependentLinksOf(
    nodeId: string,
    ownIds: Set<string>,
    incomingByTarget: Map<string, GraphLink[]>
  ): GraphLink[] {
    return (incomingByTarget.get(nodeId) ?? []).filter(
      (link) => this.isDependencyLink(link) && !ownIds.has(link.source)
    );
  }

  private isDependencyLink(link: GraphLink) {
    return isArchitecturalDependencyLink(link) || link.type === 'adr';
  }

  /**
   * Rates how trustworthy the result is: 'low' with no dependents or only weak links, 'medium'
   * when import or stack-aware links are mixed with ADR links, 'high' when such links are present
   * and no ADR link is involved.
   */
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
