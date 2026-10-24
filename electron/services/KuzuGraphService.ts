/** Client of the isolated Kuzu worker process: same API as the repository, with requests forwarded over IPC. */

import * as path from 'path';
import * as os from 'os';
import * as fs from 'fs';
import {
  KuzuAction,
  KuzuProcessManager,
  SerializableQueryResult,
  resolveWorkerScript,
} from './KuzuProcessManager';
import { isRecoverableCorruption, isWorkerCrash, quarantineDatabaseFiles } from './KuzuRecovery';

/** A node row sent to the Kuzu worker. */
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

/** An edge row sent to the Kuzu worker. */
export interface GraphEdge {
  sourceId: string;
  targetId: string;
  type: 'imports' | 'calls' | 'extends' | 'implements' | 'contains' | 'references' | 'depends_on';
  meta?: Record<string, any>;
}

export { resolveWorkerScript };

type WorkerRequest = <T>(action: KuzuAction, params?: Record<string, unknown>) => Promise<T>;

/**
 * The database is only a cache of the analysed graph, and a copy that crashes or breaks the
 * worker on open is replaced instead of failing every Kuzu tool until someone deletes it.
 */
async function initWithRecovery(request: WorkerRequest, dbPath: string): Promise<void> {
  try {
    await request<void>('init');
  } catch (error) {
    if (!isWorkerCrash(error) && !isRecoverableCorruption(error)) throw error;
    const moved = quarantineDatabaseFiles(dbPath);
    if (moved.length === 0) throw error;
    console.warn(
      `[KuzuDB] Opening ${dbPath} failed (${error instanceof Error ? error.message : String(error)}); ` +
        `moved ${moved.length} file(s) aside and starting fresh`
    );
    await request<void>('init');
  }
}

/**
 * Graph database access that runs inside a separate Node process, so a native Kuzu crash cannot take the app down.
 * The database lives in `<project>/.codemaps/graph.db`, or in the temp folder without a project.
 */
export class KuzuGraphService {
  private static readonly processManager = KuzuProcessManager.getInstance();

  private readonly dbPath: string;
  private readonly request: WorkerRequest;
  private initialized: boolean = false;

  constructor(projectPath?: string) {
    const dbDir = projectPath
      ? path.join(projectPath, '.codemaps')
      : path.join(os.tmpdir(), 'codemaps-graph');
    this.dbPath = path.join(dbDir, 'graph.db');
    this.request = (action, params) =>
      KuzuGraphService.processManager.request(action, this.dbPath, dbDir, params);

    if (!fs.existsSync(dbDir)) {
      fs.mkdirSync(dbDir, { recursive: true });
    }
  }

  /** Opens the database in the worker, replacing a database that crashes or corrupts the worker on open. Safe to call repeatedly. */
  async init(): Promise<void> {
    if (this.initialized) return;
    await initWithRecovery(this.request, this.dbPath);
    this.initialized = true;
  }

  /** Inserts a node (initializing first if needed). */
  async addNode(node: GraphNode): Promise<void> {
    if (!this.initialized) await this.init();
    await this.request<void>('addNode', { node });
  }

  /** Inserts an edge between two existing nodes (initializing first if needed). */
  async addEdge(edge: GraphEdge): Promise<void> {
    if (!this.initialized) await this.init();
    await this.request<void>('addEdge', { edge });
  }

  /** Node rows, optionally filtered by `type` and/or `filePath`. */
  async queryNodes(type?: string, filePath?: string): Promise<any[]> {
    if (!this.initialized) await this.init();
    return this.request<any[]>('queryNodes', { type, filePath });
  }

  /** Nodes linked to `nodeId` in either direction, with the connecting edge type. */
  async queryNeighbors(nodeId: string): Promise<any[]> {
    if (!this.initialized) await this.init();
    return this.request<any[]>('queryNeighbors', { nodeId });
  }

  /** Runs a Cypher query in the worker and wraps its rows in a result object offering `getAll`. */
  async query(cypherQuery: string): Promise<SerializableQueryResult> {
    if (!this.initialized) await this.init();
    const rows = await this.request<Record<string, unknown>[]>('query', { query: cypherQuery });
    return new SerializableQueryResult(rows);
  }

  /** Total number of nodes and edges. */
  async getStats(): Promise<{ nodes: number; edges: number }> {
    if (!this.initialized) await this.init();
    return this.request<{ nodes: number; edges: number }>('getStats');
  }

  /** Deletes all nodes and edges. Does nothing before initialization. */
  async clear(): Promise<void> {
    if (!this.initialized) return;
    await this.request<void>('clear');
  }

  /** Closes the database in the worker. Does nothing before initialization. */
  async close(): Promise<void> {
    if (!this.initialized) {
      return;
    }

    await this.request<void>('close');
    this.initialized = false;
  }

  static readonly shutdownProcessManager = (): void => {
    KuzuGraphService.processManager.dispose();
  };
}

let instance: KuzuGraphService | null = null;
/** Process-wide service instance. The project path is only used by the first call; later calls return the same instance whatever path they pass. */
export function getKuzuGraphService(projectPath?: string): KuzuGraphService {
  if (!instance) {
    instance = new KuzuGraphService(projectPath);
  }
  return instance;
}

/** Stops the Kuzu worker process and forgets the shared service instance. */
export function shutdownKuzuProcessManager(): void {
  KuzuGraphService.shutdownProcessManager();
  instance = null;
}
