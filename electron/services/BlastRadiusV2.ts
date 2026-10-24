/** Breadth-first impact analysis over the Kuzu graph database. */

import { KuzuGraphService } from './KuzuGraphService';

/** One affected node: its distance from the changed node and the path of ids that leads to it. */
export interface BlastNode {
  id: string;
  label: string;
  type: string;
  distance: number;
  path: string[];
}

/** Impact of changing `targetNode`: directly linked nodes, nodes reached through them, the totals, and the longest chains of dependency found. */
export interface BlastRadiusResult {
  targetNode: string;
  directDependencies: BlastNode[];
  transitiveDependencies: BlastNode[];
  totalAffected: number;
  maxDepth: number;
  riskPaths: string[][];
}

/** Computes which nodes are affected by a change, using the project's Kuzu database (which must have been filled with the graph beforehand). */
export class BlastRadiusV2 {
  private graphService: KuzuGraphService;

  constructor(projectPath: string) {
    this.graphService = new KuzuGraphService(projectPath);
  }

  /** Opens the database. */
  async init(): Promise<void> {
    await this.graphService.init();
  }

  /**
   * Walks neighbours (both link directions) from `nodeId` breadth-first up to `maxDepth` levels, counting each node once at its shortest distance.
   * `riskPaths` collects the paths of nodes at distance 3 or more, capped at 10. An unknown node yields an empty result.
   */
  async calculate(nodeId: string, maxDepth: number = 5): Promise<BlastRadiusResult> {
    const direct: BlastNode[] = [];
    const transitive: BlastNode[] = [];
    const visited = new Set<string>();
    const queue: Array<{ id: string; depth: number; path: string[] }> = [
      { id: nodeId, depth: 0, path: [nodeId] },
    ];
    const riskPaths: string[][] = [];

    visited.add(nodeId);

    while (queue.length > 0) {
      const current = queue.shift()!;

      if (current.depth >= maxDepth) continue;

      // Query neighbors through KuzuDB
      const neighbors = await this.graphService.queryNeighbors(current.id);

      for (const neighbor of neighbors) {
        const neighborId = neighbor['m.id'];

        if (visited.has(neighborId)) continue;
        visited.add(neighborId);

        const node = this.toBlastNode(neighbor, current);

        if (current.depth === 0) {
          direct.push(node);
        } else {
          transitive.push(node);
        }

        // If this is a deep path, mark as risky
        if (current.depth >= 2) {
          riskPaths.push(node.path);
        }

        queue.push({
          id: neighborId,
          depth: current.depth + 1,
          path: node.path,
        });
      }
    }

    return this.toResult(nodeId, direct, transitive, riskPaths);
  }

  /** Builds the result entry for a neighbour reached from `current`, one step further away. */
  private toBlastNode(
    neighbor: Record<string, string>,
    current: { depth: number; path: string[] }
  ): BlastNode {
    const neighborId = neighbor['m.id'];
    return {
      id: neighborId,
      label: neighbor['m.label'] || neighborId,
      type: neighbor['m.type'] || 'unknown',
      distance: current.depth + 1,
      path: [...current.path, neighborId],
    };
  }

  /** Assembles the final result and its totals; `maxDepth` is the distance of the farthest transitive node (0 if none). */
  private toResult(
    nodeId: string,
    direct: BlastNode[],
    transitive: BlastNode[],
    riskPaths: string[][]
  ): BlastRadiusResult {
    return {
      targetNode: nodeId,
      directDependencies: direct,
      transitiveDependencies: transitive,
      totalAffected: direct.length + transitive.length,
      maxDepth: Math.max(...[0, ...transitive.map((n) => n.distance)]),
      riskPaths: riskPaths.slice(0, 10), // Top 10 risky paths
    };
  }

  /** Single 0-100 score for a node, from a 3-level walk: 2 points per direct dependency, 1 per transitive one, plus half a point per level of depth. Capped at 100. */
  async getImpactScore(nodeId: string): Promise<number> {
    const result = await this.calculate(nodeId, 3);

    // Score based on: direct deps (weight 2) + transitive (weight 1) + depth penalty
    const directWeight = result.directDependencies.length * 2;
    const transitiveWeight = result.transitiveDependencies.length;
    const depthPenalty = result.maxDepth * 0.5;

    return Math.min(100, directWeight + transitiveWeight + depthPenalty);
  }

  /** Closes the database. */
  async close(): Promise<void> {
    await this.graphService.close();
  }
}
