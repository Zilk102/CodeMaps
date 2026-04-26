import { KuzuGraphService, GraphNode, GraphEdge } from './KuzuGraphService';

// Local type definitions to avoid cross-project imports
interface GraphData {
  projectRoot: string;
  nodes: Array<{
    id: string;
    label: string;
    group: number;
    type: string;
    churn?: number;
    adr?: string;
    path?: string;
    line?: number;
    column?: number;
    language?: string;
    meta?: Record<string, any>;
  }>;
  links: Array<{
    source: string | { id: string };
    target: string | { id: string };
    value: number;
    type?: string;
    meta?: Record<string, any>;
  }>;
}

export class KuzuIntegration {
  private service: KuzuGraphService;

  constructor(projectPath: string) {
    this.service = new KuzuGraphService(projectPath);
  }

  async init(): Promise<void> {
    await this.service.init();
  }

  async storeGraph(graphData: GraphData): Promise<void> {
    await this.service.clear();

    // Store nodes
    for (const node of graphData.nodes) {
      await this.service.addNode({
        id: node.id,
        type: this.mapNodeType(node.type),
        label: node.label,
        filePath: node.id, // Using id as path for now
        line: 0,
        column: 0,
        language: undefined,
        meta: { group: node.group, churn: node.churn, adr: node.adr },
      });
    }

    // Store edges (links)
    for (const link of graphData.links) {
      const sourceId = typeof link.source === 'string' ? link.source : link.source.id;
      const targetId = typeof link.target === 'string' ? link.target : link.target.id;
      
      await this.service.addEdge({
        sourceId,
        targetId,
        type: this.mapLinkType(link.type),
        meta: { value: link.value },
      });
    }

    const stats = await this.service.getStats();
    console.log('[KuzuIntegration] Stored graph:', stats);
  }

  async getNodeNeighbors(nodeId: string): Promise<any[]> {
    return this.service.queryNeighbors(nodeId);
  }

  async getStats(): Promise<{ nodes: number; edges: number }> {
    return this.service.getStats();
  }

  async close(): Promise<void> {
    await this.service.close();
  }

  private mapNodeType(type?: string): GraphNode['type'] {
    const mapping: Record<string, GraphNode['type']> = {
      'file': 'file',
      'class': 'class',
      'function': 'function',
      'method': 'method',
      'interface': 'interface',
      'variable': 'variable',
      'adr': 'adr',
      'directory': 'directory',
    };
    return mapping[type || ''] || 'file';
  }

  private mapLinkType(type?: string): GraphEdge['type'] {
    const mapping: Record<string, GraphEdge['type']> = {
      'structure': 'contains',
      'import': 'imports',
      'adr': 'references',
      'entity': 'depends_on',
    };
    return mapping[type || ''] || 'depends_on';
  }
}
