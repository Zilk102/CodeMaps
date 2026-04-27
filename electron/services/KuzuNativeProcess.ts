import { Connection, Database, QueryResult } from 'kuzu';

interface GraphNode {
  id: string;
  type: 'file' | 'class' | 'function' | 'method' | 'interface' | 'variable' | 'adr' | 'directory';
  label: string;
  filePath: string;
  line?: number;
  column?: number;
  language?: string;
  meta?: Record<string, unknown>;
}

interface GraphEdge {
  sourceId: string;
  targetId: string;
  type: 'imports' | 'calls' | 'extends' | 'implements' | 'contains' | 'references' | 'depends_on';
  meta?: Record<string, unknown>;
}

type KuzuAction =
  | 'init'
  | 'addNode'
  | 'addEdge'
  | 'query'
  | 'queryNodes'
  | 'queryNeighbors'
  | 'getStats'
  | 'clear'
  | 'close';

interface KuzuRequest {
  id: number;
  action: KuzuAction;
  dbPath: string;
  dbDir: string;
  params?: Record<string, unknown>;
}

interface KuzuResponse {
  id: number;
  ok: boolean;
  result?: unknown;
  error?: {
    name: string;
    message: string;
    stack?: string;
  };
}

interface SharedKuzuState {
  db: Database;
  conn: Connection;
  refCount: number;
}

class NativeKuzuService {
  private static sharedConnections = new Map<string, SharedKuzuState>();

  private db: Database | undefined;
  private conn: Connection | undefined;
  private initialized = false;

  constructor(
    private readonly dbPath: string,
    private readonly dbDir: string
  ) {}

  async init(): Promise<void> {
    if (this.initialized) {
      return;
    }

    const sharedState = NativeKuzuService.sharedConnections.get(this.dbPath);
    if (sharedState) {
      sharedState.refCount += 1;
      this.db = sharedState.db;
      this.conn = sharedState.conn;
    } else {
      const db = new Database(this.dbPath);
      await db.init();
      const conn = new Connection(db);
      await conn.init();

      this.db = db;
      this.conn = conn;
      NativeKuzuService.sharedConnections.set(this.dbPath, {
        db,
        conn,
        refCount: 1,
      });
    }

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
      if (!isAlreadyExistsError(error)) {
        throw error;
      }
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
      if (!isAlreadyExistsError(error)) {
        throw error;
      }
    }

    this.initialized = true;
  }

  async addNode(node: GraphNode): Promise<void> {
    if (!this.initialized) {
      await this.init();
    }

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
    if (!this.initialized) {
      await this.init();
    }

    const metaStr = escapeCypherString(JSON.stringify(edge.meta ?? {}));
    const query = `
      MATCH (a:FileNode {id: '${escapeCypherString(edge.sourceId)}'}),
            (b:FileNode {id: '${escapeCypherString(edge.targetId)}'})
      CREATE (a)-[:FileEdge {type: '${edge.type}', meta: '${metaStr}'}]->(b)
    `;
    await this.runQuery(query);
  }

  async queryNodes(type?: string, filePath?: string): Promise<Record<string, unknown>[]> {
    if (!this.initialized) {
      await this.init();
    }

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
    if (!this.initialized) {
      await this.init();
    }

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
    if (!this.initialized) {
      await this.init();
    }

    const result = await this.runQuery(cypherQuery);
    return this.getAll(result);
  }

  async getStats(): Promise<{ nodes: number; edges: number }> {
    if (!this.initialized) {
      await this.init();
    }

    const nodeRows = await this.query('MATCH (n:FileNode) RETURN COUNT(n) as count');
    const edgeRows = await this.query('MATCH ()-[r:FileEdge]->() RETURN COUNT(r) as count');
    return {
      nodes: Number(nodeRows[0]?.count ?? 0),
      edges: Number(edgeRows[0]?.count ?? 0),
    };
  }

  async clear(): Promise<void> {
    if (!this.initialized) {
      return;
    }

    await this.runQuery('MATCH ()-[r:FileEdge]->() DELETE r');
    await this.runQuery('MATCH (n:FileNode) DELETE n');
  }

  async close(): Promise<void> {
    if (!this.initialized) {
      this.conn = undefined;
      this.db = undefined;
      return;
    }

    const sharedState = NativeKuzuService.sharedConnections.get(this.dbPath);
    if (sharedState) {
      sharedState.refCount = Math.max(0, sharedState.refCount - 1);

      if (sharedState.refCount === 0 && !this.shouldKeepConnectionOpen()) {
        await sharedState.db.close();
        await sharedState.conn.close();
        NativeKuzuService.sharedConnections.delete(this.dbPath);
      }
    }

    this.conn = undefined;
    this.db = undefined;
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

  private shouldKeepConnectionOpen(): boolean {
    const nodeMajor = Number.parseInt(process.versions.node.split('.')[0] || '0', 10);
    return process.platform === 'win32' && nodeMajor >= 22;
  }
}

const services = new Map<string, NativeKuzuService>();
const taskChains = new Map<string, Promise<unknown>>();

function getService(dbPath: string, dbDir: string): NativeKuzuService {
  let service = services.get(dbPath);
  if (!service) {
    service = new NativeKuzuService(dbPath, dbDir);
    services.set(dbPath, service);
  }
  return service;
}

function runSerialized<T>(dbPath: string, task: () => Promise<T>): Promise<T> {
  const previous = taskChains.get(dbPath) ?? Promise.resolve();
  const current = previous
    .catch(() => undefined)
    .then(task);

  taskChains.set(dbPath, current);
  return current.finally(() => {
    if (taskChains.get(dbPath) === current) {
      taskChains.delete(dbPath);
    }
  });
}

function isRequest(value: unknown): value is KuzuRequest {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const request = value as Partial<KuzuRequest>;
  return (
    typeof request.id === 'number' &&
    typeof request.action === 'string' &&
    typeof request.dbPath === 'string' &&
    typeof request.dbDir === 'string'
  );
}

function isAlreadyExistsError(error: unknown): boolean {
  return error instanceof Error && error.message.includes('already exists');
}

function escapeCypherString(value: string): string {
  return value.replace(/'/g, "''");
}

function serializeError(error: unknown): KuzuResponse['error'] {
  if (error instanceof Error) {
    return {
      name: error.name,
      message: error.message,
      stack: error.stack,
    };
  }

  return {
    name: 'Error',
    message: String(error),
  };
}

async function executeRequest(request: KuzuRequest): Promise<unknown> {
  const service = getService(request.dbPath, request.dbDir);

  switch (request.action) {
    case 'init':
      await service.init();
      return null;
    case 'addNode':
      await service.addNode(request.params?.node as GraphNode);
      return null;
    case 'addEdge':
      await service.addEdge(request.params?.edge as GraphEdge);
      return null;
    case 'query':
      return service.query(String(request.params?.query ?? ''));
    case 'queryNodes':
      return service.queryNodes(
        typeof request.params?.type === 'string' ? request.params.type : undefined,
        typeof request.params?.filePath === 'string' ? request.params.filePath : undefined
      );
    case 'queryNeighbors':
      return service.queryNeighbors(String(request.params?.nodeId ?? ''));
    case 'getStats':
      return service.getStats();
    case 'clear':
      await service.clear();
      return null;
    case 'close':
      await service.close();
      services.delete(request.dbPath);
      return null;
    default:
      throw new Error(`Unsupported Kuzu action: ${String(request.action)}`);
  }
}

process.on('message', (payload) => {
  if (!isRequest(payload)) {
    return;
  }

  void runSerialized(payload.dbPath, () => executeRequest(payload))
    .then((result) => {
      const response: KuzuResponse = {
        id: payload.id,
        ok: true,
        result,
      };
      process.send?.(response);
    })
    .catch((error: unknown) => {
      const response: KuzuResponse = {
        id: payload.id,
        ok: false,
        error: serializeError(error),
      };
      process.send?.(response);
    });
});

process.on('disconnect', () => {
  process.exit(0);
});
