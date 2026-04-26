import { KuzuGraphService } from './KuzuGraphService';

export interface BlastNode {
  id: string;
  label: string;
  type: string;
  distance: number;
  path: string[];
}

export interface BlastRadiusResult {
  targetNode: string;
  directDependencies: BlastNode[];
  transitiveDependencies: BlastNode[];
  totalAffected: number;
  maxDepth: number;
  riskPaths: string[][];
}

export class BlastRadiusV2 {
  private graphService: KuzuGraphService;

  constructor(projectPath: string) {
    this.graphService = new KuzuGraphService(projectPath);
  }

  async init(): Promise<void> {
    await this.graphService.init();
  }

  async calculate(nodeId: string, maxDepth: number = 5): Promise<BlastRadiusResult> {
    const direct: BlastNode[] = [];
    const transitive: BlastNode[] = [];
    const visited = new Set<string>();
    const queue: Array<{ id: string; depth: number; path: string[] }> = [{ id: nodeId, depth: 0, path: [nodeId] }];
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

        const node: BlastNode = {
          id: neighborId,
          label: neighbor['m.label'] || neighborId,
          type: neighbor['m.type'] || 'unknown',
          distance: current.depth + 1,
          path: [...current.path, neighborId],
        };

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

    return {
      targetNode: nodeId,
      directDependencies: direct,
      transitiveDependencies: transitive,
      totalAffected: direct.length + transitive.length,
      maxDepth: Math.max(...[0, ...transitive.map(n => n.distance)]),
      riskPaths: riskPaths.slice(0, 10), // Top 10 risky paths
    };
  }

  async getImpactScore(nodeId: string): Promise<number> {
    const result = await this.calculate(nodeId, 3);
    
    // Score based on: direct deps (weight 2) + transitive (weight 1) + depth penalty
    const directWeight = result.directDependencies.length * 2;
    const transitiveWeight = result.transitiveDependencies.length;
    const depthPenalty = result.maxDepth * 0.5;
    
    return Math.min(100, directWeight + transitiveWeight + depthPenalty);
  }

  async close(): Promise<void> {
    await this.graphService.close();
  }
}
