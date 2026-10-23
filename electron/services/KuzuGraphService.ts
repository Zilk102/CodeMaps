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

  async init(): Promise<void> {
    if (this.initialized) return;
    await initWithRecovery(this.request, this.dbPath);
    this.initialized = true;
  }

  async addNode(node: GraphNode): Promise<void> {
    if (!this.initialized) await this.init();
    await this.request<void>('addNode', { node });
  }

  async addEdge(edge: GraphEdge): Promise<void> {
    if (!this.initialized) await this.init();
    await this.request<void>('addEdge', { edge });
  }

  async queryNodes(type?: string, filePath?: string): Promise<any[]> {
    if (!this.initialized) await this.init();
    return this.request<any[]>('queryNodes', { type, filePath });
  }

  async queryNeighbors(nodeId: string): Promise<any[]> {
    if (!this.initialized) await this.init();
    return this.request<any[]>('queryNeighbors', { nodeId });
  }

  async query(cypherQuery: string): Promise<SerializableQueryResult> {
    if (!this.initialized) await this.init();
    const rows = await this.request<Record<string, unknown>[]>('query', { query: cypherQuery });
    return new SerializableQueryResult(rows);
  }

  async getStats(): Promise<{ nodes: number; edges: number }> {
    if (!this.initialized) await this.init();
    return this.request<{ nodes: number; edges: number }>('getStats');
  }

  async clear(): Promise<void> {
    if (!this.initialized) return;
    await this.request<void>('clear');
  }

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
export function getKuzuGraphService(projectPath?: string): KuzuGraphService {
  if (!instance) {
    instance = new KuzuGraphService(projectPath);
  }
  return instance;
}

export function shutdownKuzuProcessManager(): void {
  KuzuGraphService.shutdownProcessManager();
  instance = null;
}
