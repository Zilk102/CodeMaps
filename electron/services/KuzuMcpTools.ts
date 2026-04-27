import { KuzuGraphService } from './KuzuGraphService';

export interface KuzuMcpTool {
  name: string;
  description: string;
  inputSchema: object;
}

export const KUZU_MCP_TOOLS: KuzuMcpTool[] = [
  {
    name: 'graph_query',
    description: 'Execute a Cypher query against the project graph database. Returns nodes, edges, or aggregated results.',
    inputSchema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Cypher query string' },
      },
      required: ['query'],
    },
  },
  {
    name: 'graph_stats',
    description: 'Get statistics about the project graph: total nodes, edges, and breakdown by type.',
    inputSchema: {
      type: 'object',
      properties: {},
    },
  },
  {
    name: 'graph_neighbors',
    description: 'Get all neighbors (connected nodes) of a specific node in the graph.',
    inputSchema: {
      type: 'object',
      properties: {
        nodeId: { type: 'string', description: 'ID of the node to query' },
        edgeType: { type: 'string', description: 'Optional: filter by edge type (imports, calls, extends, etc.)' },
      },
      required: ['nodeId'],
    },
  },
];

export class KuzuMcpTools {
  private service: KuzuGraphService;

  constructor(projectPath: string) {
    this.service = new KuzuGraphService(projectPath);
  }

  async init(): Promise<void> {
    await this.service.init();
  }

  async graphQuery(query: string): Promise<any[]> {
    const result = await this.service.query(query);
    return result.getAll();
  }

  async graphStats(): Promise<{ nodes: number; edges: number; types: Record<string, number> }> {
    const stats = await this.service.getStats();
    
    // Get breakdown by node type
    const typeResult = await this.service.query(`
      MATCH (n:FileNode)
      RETURN n.type as type, COUNT(n) as count
      ORDER BY count DESC
    `);
    const types: Record<string, number> = {};
    const typeRows = await typeResult.getAll();
    for (const row of typeRows) {
      const type = String(row.type ?? 'unknown');
      const count = Number(row.count ?? 0);
      types[type] = count;
    }

    return { ...stats, types };
  }

  async graphNeighbors(nodeId: string): Promise<any[]> {
    return this.service.queryNeighbors(nodeId);
  }

  async close(): Promise<void> {
    await this.service.close();
  }
}
