/** Direct Kuzu database access for the graph tables (nodes and edges) and the Cypher queries over them. */

import { Connection, QueryResult } from 'kuzu';
import { KuzuConnectionManager } from './KuzuConnectionManager';

/** A node row of the Kuzu graph. `meta` is stored as JSON text. */
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

/** An edge row of the Kuzu graph between two node ids. `meta` is stored as JSON text. */
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

const NODE_TABLE_DDL = `
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
`;

const EDGE_TABLE_DDL = `
  CREATE REL TABLE FileEdge (
    FROM FileNode TO FileNode,
    type STRING,
    meta STRING
  )
`;

/** Creates both tables, treating "already exists" as success so init is idempotent. */
async function createSchema(run: (query: string) => Promise<unknown>): Promise<void> {
  for (const ddl of [NODE_TABLE_DDL, EDGE_TABLE_DDL]) {
    try {
      await run(ddl);
    } catch (error: unknown) {
      if (!isAlreadyExistsError(error)) throw error;
    }
  }
}

/** Runs one Cypher statement and returns its single result. Throws if the connection is not initialized or the statement yields several results. */
async function runQuery(
  conn: Connection | undefined,
  dbDir: string,
  query: string
): Promise<QueryResult> {
  if (!conn) {
    throw new Error(`Kuzu connection is not initialized for ${dbDir}`);
  }

  const result = await conn.query(query);
  if (Array.isArray(result)) {
    if (result.length !== 1) {
      throw new Error(`Expected a single Kuzu query result, received ${result.length}`);
    }
    return result[0];
  }
  return result;
}

function getAll(result: QueryResult): Promise<Record<string, unknown>[]> {
  return result.getAll() as Promise<Record<string, unknown>[]>;
}

/** Reads and writes one project's graph database. Methods initialize it on first use; values are escaped before they are placed into Cypher text. */
export class KuzuGraphRepository {
  private conn: Connection | undefined;
  private initialized = false;

  constructor(
    private readonly dbPath: string,
    private readonly dbDir: string
  ) {}

  /** Acquires the shared connection and creates the node and edge tables if needed. Safe to call repeatedly. */
  async init(): Promise<void> {
    if (this.initialized) return;

    const { conn } = await KuzuConnectionManager.getConnection(this.dbPath);
    this.conn = conn;

    await createSchema((query) => runQuery(conn, this.dbDir, query));

    this.initialized = true;
  }

  /** Inserts a node row; fails if a node with the same id exists. */
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
    await runQuery(this.conn, this.dbDir, query);
  }

  /** Inserts an edge between two existing nodes; does nothing if either node is missing. */
  async addEdge(edge: GraphEdge): Promise<void> {
    if (!this.initialized) await this.init();

    const metaStr = escapeCypherString(JSON.stringify(edge.meta ?? {}));
    const query = `
      MATCH (a:FileNode {id: '${escapeCypherString(edge.sourceId)}'}),
            (b:FileNode {id: '${escapeCypherString(edge.targetId)}'})
      CREATE (a)-[:FileEdge {type: '${edge.type}', meta: '${metaStr}'}]->(b)
    `;
    await runQuery(this.conn, this.dbDir, query);
  }

  /** Rows for nodes, optionally filtered by node `type` and/or `filePath`. */
  async queryNodes(type?: string, filePath?: string): Promise<Record<string, unknown>[]> {
    if (!this.initialized) await this.init();

    let whereClause = '';
    if (type) {
      whereClause += ` WHERE n.type = '${escapeCypherString(type)}'`;
    }
    if (filePath) {
      whereClause += `${whereClause ? ' AND' : ' WHERE'} n.filePath = '${escapeCypherString(filePath)}'`;
    }

    const result = await runQuery(
      this.conn,
      this.dbDir,
      `MATCH (n:FileNode)${whereClause} RETURN n.id, n.type, n.label, n.filePath, n.line, n.language, n.meta`
    );
    return getAll(result);
  }

  /** Nodes directly linked to `nodeId` in either direction, with the type of the connecting edge as `edgeType`. */
  async queryNeighbors(nodeId: string): Promise<Record<string, unknown>[]> {
    if (!this.initialized) await this.init();

    const safeId = escapeCypherString(nodeId);
    const result = await runQuery(
      this.conn,
      this.dbDir,
      `
      MATCH (n:FileNode {id: '${safeId}'})-[r:FileEdge]->(m:FileNode)
      RETURN m.id, m.type, m.label, m.filePath, r.type as edgeType
      UNION
      MATCH (n:FileNode {id: '${safeId}'})<-[r:FileEdge]-(m:FileNode)
      RETURN m.id, m.type, m.label, m.filePath, r.type as edgeType
    `
    );
    return getAll(result);
  }

  /** Runs an arbitrary Cypher query and returns its rows. */
  async query(cypherQuery: string): Promise<Record<string, unknown>[]> {
    if (!this.initialized) await this.init();
    const result = await runQuery(this.conn, this.dbDir, cypherQuery);
    return getAll(result);
  }

  /** Total number of nodes and edges. */
  async getStats(): Promise<{ nodes: number; edges: number }> {
    if (!this.initialized) await this.init();

    const nodeRows = await this.query('MATCH (n:FileNode) RETURN COUNT(n) as count');
    const edgeRows = await this.query('MATCH ()-[r:FileEdge]->() RETURN COUNT(r) as count');
    return {
      nodes: Number(nodeRows[0]?.count ?? 0),
      edges: Number(edgeRows[0]?.count ?? 0),
    };
  }

  /** Deletes all edges and nodes. Does nothing before initialization. */
  async clear(): Promise<void> {
    if (!this.initialized) return;
    await runQuery(this.conn, this.dbDir, 'MATCH ()-[r:FileEdge]->() DELETE r');
    await runQuery(this.conn, this.dbDir, 'MATCH (n:FileNode) DELETE n');
  }

  /** Releases this repository's share of the connection. Does nothing before initialization. */
  async close(): Promise<void> {
    if (!this.initialized) return;

    await KuzuConnectionManager.releaseConnection(this.dbPath);
    this.conn = undefined;
    this.initialized = false;
  }
}
