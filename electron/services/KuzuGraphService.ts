import kuzu from 'kuzu';
import * as path from 'path';
import * as os from 'os';
import * as fs from 'fs';

export interface GraphNode {
  id: string;
  type: 'file' | 'class' | 'function' | 'method' | 'interface' | 'variable' | 'adr' | 'directory';
  label: string;
  filePath: string;
  line?: number;
  column?: number;
  language?: string;
  meta?: Record<string, any>;
}

export interface GraphEdge {
  sourceId: string;
  targetId: string;
  type: 'imports' | 'calls' | 'extends' | 'implements' | 'contains' | 'references' | 'depends_on';
  meta?: Record<string, any>;
}

export class KuzuGraphService {
  private db: any;
  private conn: any;
  private dbPath: string;
  private initialized: boolean = false;

  constructor(projectPath?: string) {
    if (projectPath) {
      this.dbPath = path.join(projectPath, '.codemaps', 'graph.db');
      const dir = path.dirname(this.dbPath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
    } else {
      this.dbPath = path.join(os.tmpdir(), 'codemaps-graph.db');
    }
  }

  async init(): Promise<void> {
    if (this.initialized) return;

    this.db = new kuzu.Database(this.dbPath);
    this.conn = new kuzu.Connection(this.db);

    try {
      await this.conn.query(`
        CREATE NODE TABLE FileNode (
          id STRING PRIMARY KEY,
          type STRING,
          label STRING,
          filePath STRING,
          line INT64,
          col INT64,
          language STRING,
          meta STRING
        )
      `);
    } catch (e: any) {
      if (!e.message?.includes('already exists')) throw e;
    }

    try {
      await this.conn.query(`
        CREATE REL TABLE FileEdge (
          FROM FileNode TO FileNode,
          type STRING,
          meta STRING
        )
      `);
    } catch (e: any) {
      if (!e.message?.includes('already exists')) throw e;
    }

    this.initialized = true;
    console.log('[KuzuGraph] Initialized at:', this.dbPath);
  }

  async addNode(node: GraphNode): Promise<void> {
    if (!this.initialized) await this.init();
    const metaStr = JSON.stringify(node.meta || {}).replace(/'/g, "''");
    const query = `
      CREATE (n:FileNode {
        id: '${node.id.replace(/'/g, "''")}',
        type: '${node.type}',
        label: '${node.label.replace(/'/g, "''")}',
        filePath: '${node.filePath.replace(/'/g, "''")}',
        line: ${node.line || 0},
        col: ${node.column || 0},
        language: '${(node.language || '').replace(/'/g, "''")}',
        meta: '${metaStr}'
      })
    `;
    await this.conn.query(query);
  }

  async addEdge(edge: GraphEdge): Promise<void> {
    if (!this.initialized) await this.init();
    const metaStr = JSON.stringify(edge.meta || {}).replace(/'/g, "''");
    const query = `
      MATCH (a:FileNode {id: '${edge.sourceId.replace(/'/g, "''")}'}),
            (b:FileNode {id: '${edge.targetId.replace(/'/g, "''")}'})
      CREATE (a)-[:FileEdge {type: '${edge.type}', meta: '${metaStr}'}]->(b)
    `;
    await this.conn.query(query);
  }

  async queryNodes(type?: string, filePath?: string): Promise<any[]> {
    if (!this.initialized) await this.init();
    let whereClause = '';
    if (type) whereClause += ` WHERE n.type = '${type}'`;
    if (filePath) whereClause += (whereClause ? ' AND' : ' WHERE') + ` n.filePath = '${filePath.replace(/'/g, "''")}'`;
    const result = await this.conn.query(`MATCH (n:FileNode)${whereClause} RETURN n.id, n.type, n.label, n.filePath, n.line, n.language, n.meta`);
    return result.getAll();
  }

  async queryNeighbors(nodeId: string, edgeType?: string): Promise<any[]> {
    if (!this.initialized) await this.init();
    const safeId = nodeId.replace(/'/g, "''");
    const result = await this.conn.query(`
      MATCH (n:FileNode {id: '${safeId}'})-[r:FileEdge]->(m:FileNode)
      RETURN m.id, m.type, m.label, m.filePath, r.type as edgeType
      UNION
      MATCH (n:FileNode {id: '${safeId}'})\u003c-[r:FileEdge]-(m:FileNode)
      RETURN m.id, m.type, m.label, m.filePath, r.type as edgeType
    `);
    return result.getAll();
  }

  async query(cypherQuery: string): Promise<any> {
    if (!this.initialized) await this.init();
    return this.conn.query(cypherQuery);
  }

  async getStats(): Promise<{ nodes: number; edges: number }> {
    if (!this.initialized) await this.init();
    const nodeResult = await this.conn.query('MATCH (n:FileNode) RETURN COUNT(n) as count');
    const edgeResult = await this.conn.query('MATCH ()-[r:FileEdge]->() RETURN COUNT(r) as count');
    const nodes = await nodeResult.getAll();
    const edges = await edgeResult.getAll();
    return { nodes: nodes[0]?.count || 0, edges: edges[0]?.count || 0 };
  }

  async clear(): Promise<void> {
    if (!this.initialized) return;
    await this.conn.query('MATCH ()-[r:FileEdge]->() DELETE r');
    await this.conn.query('MATCH (n:FileNode) DELETE n');
  }

  async close(): Promise<void> {
    if (this.conn) await this.conn.close();
    if (this.db) await this.db.close();
    this.initialized = false;
  }
}

let instance: KuzuGraphService | null = null;
export function getKuzuGraphService(projectPath?: string): KuzuGraphService {
  if (!instance) {
    instance = new KuzuGraphService(projectPath);
  }
  return instance;
}
