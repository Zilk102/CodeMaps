import { Connection, QueryResult } from 'kuzu';
import { KuzuConnectionManager } from './KuzuConnectionManager';

export interface GraphNode {
  id: string;
  type: 'file' | 'class' | 'function' | 'method' | 'interface' | 'variable' | 'adr' | 'directory';
  label: string;
  filePath: string;
  line?: number;
  column?: number;
  language?: string;
  meta?: Record<string, unknown>;
}

export interface GraphEdge {
  sourceId: string;
  targetId: string;
  type: 'imports' | 'calls' | 'extends' | 'implements' | 'contains' | 'references' | 'depends_on';
  meta?: Record<string, unknown>;
}

function escapeCypherString(value: string): string {
  return value.replace(/'/g, "''");
}

function isAlreadyExistsError(error: unknown): boolean {
  return error instanceof Error && error.message.includes('already exists');
}

export class KuzuGraphRepository {
  private conn: Connection | undefined;
  private initialized = false;

  constructor(
    private readonly dbPath: string,
    private readonly dbDir: string
  ) {}

  async init(): Promise<void> {
    if (this.initialized) return;

    const { conn } = await KuzuConnectionManager.getConnection(this.dbPath);
    this.conn = conn;

    try {
      await this.runQuery(`
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
    } catch (error: unknown) {
      if (!isAlreadyExistsError(error)) throw error;
    }

    try {
      await this.runQuery(`
        CREATE REL TABLE FileEdge (
          FROM FileNode TO FileNode,
          type STRING,
          meta STRING
        )
      `);
    } catch (error: unknown) {
      if (!isAlreadyExistsError(error)) throw error;
    }

    this.initialized = true;
  }

  async addNode(node: GraphNode): Promise<void> {
    if (!this.initialized) await this.init();

    const metaStr = escapeCypherString(JSON.stringify(node.meta ?? {}));
    const query = `
      CREATE (n:FileNode {
        id: '${escapeCypherString(node.id)}',
        type: '${node.type}',
        label: '${escapeCypherString(node.label)}',
        filePath: '${escapeCypherString(node.filePath)}',
        line: ${node.line ?? 0},
        col: ${node.column ?? 0},
        language: '${escapeCypherString(node.language ?? '')}',
        meta: '${metaStr}'
      })
    `;
    await this.runQuery(query);
  }

  async addEdge(edge: GraphEdge): Promise<void> {
    if (!this.initialized) await this.init();

    const metaStr = escapeCypherString(JSON.stringify(edge.meta ?? {}));
    const query = `
      MATCH (a:FileNode {id: '${escapeCypherString(edge.sourceId)}'}),
            (b:FileNode {id: '${escapeCypherString(edge.targetId)}'})
      CREATE (a)-[:FileEdge {type: '${edge.type}', meta: '${metaStr}'}]->(b)
    `;
    await this.runQuery(query);
  }

  async queryNodes(type?: string, filePath?: string): Promise<Record<string, unknown>[]> {
    if (!this.initialized) await this.init();

    let whereClause = '';
    if (type) {
      whereClause += ` WHERE n.type = '${escapeCypherString(type)}'`;
    }
    if (filePath) {
      whereClause += `${whereClause ? ' AND' : ' WHERE'} n.filePath = '${escapeCypherString(filePath)}'`;
    }

    const result = await this.runQuery(
      `MATCH (n:FileNode)${whereClause} RETURN n.id, n.type, n.label, n.filePath, n.line, n.language, n.meta`
    );
    return this.getAll(result);
  }

  async queryNeighbors(nodeId: string): Promise<Record<string, unknown>[]> {
    if (!this.initialized) await this.init();

    const safeId = escapeCypherString(nodeId);
    const result = await this.runQuery(`
      MATCH (n:FileNode {id: '${safeId}'})-[r:FileEdge]->(m:FileNode)
      RETURN m.id, m.type, m.label, m.filePath, r.type as edgeType
      UNION
      MATCH (n:FileNode {id: '${safeId}'})<-[r:FileEdge]-(m:FileNode)
      RETURN m.id, m.type, m.label, m.filePath, r.type as edgeType
    `);
    return this.getAll(result);
  }

  async query(cypherQuery: string): Promise<Record<string, unknown>[]> {
    if (!this.initialized) await this.init();
    const result = await this.runQuery(cypherQuery);
    return this.getAll(result);
  }

  async getStats(): Promise<{ nodes: number; edges: number }> {
    if (!this.initialized) await this.init();

    const nodeRows = await this.query('MATCH (n:FileNode) RETURN COUNT(n) as count');
    const edgeRows = await this.query('MATCH ()-[r:FileEdge]->() RETURN COUNT(r) as count');
    return {
      nodes: Number(nodeRows[0]?.count ?? 0),
      edges: Number(edgeRows[0]?.count ?? 0),
    };
  }

  async clear(): Promise<void> {
    if (!this.initialized) return;
    await this.runQuery('MATCH ()-[r:FileEdge]->() DELETE r');
    await this.runQuery('MATCH (n:FileNode) DELETE n');
  }

  async close(): Promise<void> {
    if (!this.initialized) return;

    await KuzuConnectionManager.releaseConnection(this.dbPath);
    this.conn = undefined;
    this.initialized = false;
  }

  private async runQuery(query: string): Promise<QueryResult> {
    if (!this.conn) {
      throw new Error(`Kuzu connection is not initialized for ${this.dbDir}`);
    }

    const result = await this.conn.query(query);
    if (Array.isArray(result)) {
      if (result.length !== 1) {
        throw new Error(`Expected a single Kuzu query result, received ${result.length}`);
      }
      return result[0];
    }
    return result;
  }

  private async getAll(result: QueryResult): Promise<Record<string, unknown>[]> {
    return result.getAll() as Promise<Record<string, unknown>[]>;
  }
}
