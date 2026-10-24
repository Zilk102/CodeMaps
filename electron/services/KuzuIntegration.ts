/** Copies the application graph into the Kuzu database, translating node and link types. */

import { KuzuGraphService, GraphNode, GraphEdge } from './KuzuGraphService';
import type { GraphData } from '../store';

/** Persists a project's `GraphData` into its Kuzu database so it can be queried with Cypher (blast radius, PR impact). */
export class KuzuIntegration {
  private service: KuzuGraphService;

  constructor(projectPath: string) {
    this.service = new KuzuGraphService(projectPath);
  }

  /** Opens the underlying database. */
  async init(): Promise<void> {
    await this.service.init();
  }

  /** Replaces the database contents with `graphData`: clears it, then inserts every node and every link. Slow for large graphs, since rows are written one at a time. */
  async storeGraph(graphData: GraphData): Promise<void> {
    await this.service.clear();

    // Store nodes
    for (const node of graphData.nodes) {
      const filePath = node.filePath || node.parentId || node.id.split('#')[0];
      await this.service.addNode({
        id: node.id,
        type: this.mapNodeType(node.type),
        label: node.label,
        filePath,
        line: node.sourceLocation?.startLine ?? 0,
        column: node.sourceLocation?.startColumn ?? 0,
        language: node.language,
        meta: {
          group: node.group,
          churn: node.churn,
          adr: node.adr,
          parentId: node.parentId,
          sourceLocation: node.sourceLocation,
        },
      });
    }

    // Store edges (links)
    for (const link of graphData.links) {
      await this.service.addEdge({
        sourceId: link.source,
        targetId: link.target,
        type: this.mapLinkType(link.type),
        meta: { value: link.value },
      });
    }

    const stats = await this.service.getStats();
    console.log('[KuzuIntegration] Stored graph:', stats);
  }

  /** Nodes directly linked to `nodeId` in either direction. */
  async getNodeNeighbors(nodeId: string): Promise<any[]> {
    return this.service.queryNeighbors(nodeId);
  }

  /** Number of nodes and edges currently stored. */
  async getStats(): Promise<{ nodes: number; edges: number }> {
    return this.service.getStats();
  }

  /** Closes the underlying database. */
  async close(): Promise<void> {
    await this.service.close();
  }

  /** Maps an application node type to a database node type; unknown types become `file`. */
  private mapNodeType(type?: string): GraphNode['type'] {
    const mapping: Record<string, GraphNode['type']> = {
      file: 'file',
      class: 'class',
      function: 'function',
      method: 'method',
      interface: 'interface',
      variable: 'variable',
      adr: 'adr',
      directory: 'directory',
    };
    return mapping[type || ''] || 'file';
  }

  /** Maps an application link type to a database edge type: structure becomes `contains`, import `imports`, adr `references`, everything else `depends_on`. */
  private mapLinkType(type?: string): GraphEdge['type'] {
    const mapping: Record<string, GraphEdge['type']> = {
      structure: 'contains',
      import: 'imports',
      adr: 'references',
      entity: 'depends_on',
      framework: 'depends_on',
      build: 'depends_on',
    };
    return mapping[type || ''] || 'depends_on';
  }
}
