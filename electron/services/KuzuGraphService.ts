import { ChildProcess, fork } from 'child_process';
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

class SerializableQueryResult {
  constructor(private readonly rows: Record<string, unknown>[]) {}

  async getAll(): Promise<Record<string, unknown>[]> {
    return this.rows;
  }
}

class KuzuProcessManager {
  private static instance: KuzuProcessManager | null = null;

  private child: ChildProcess | null = null;
  private nextRequestId = 1;
  private readonly pending = new Map<
    number,
    {
      resolve: (value: unknown) => void;
      reject: (reason?: unknown) => void;
      timeout: NodeJS.Timeout;
    }
  >();

  static getInstance(): KuzuProcessManager {
    if (!this.instance) {
      this.instance = new KuzuProcessManager();
    }
    return this.instance;
  }

  private constructor() {
    process.once('exit', () => {
      this.dispose();
    });
  }

  async request<T>(action: KuzuAction, dbPath: string, dbDir: string, params?: Record<string, unknown>): Promise<T> {
    const child = this.ensureChild();
    const id = this.nextRequestId++;

    return new Promise<T>((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`Kuzu background worker timeout for action "${action}"`));
      }, 120_000);

      this.pending.set(id, {
        resolve: (value) => resolve(value as T),
        reject,
        timeout,
      });

      const request: KuzuRequest = {
        id,
        action,
        dbPath,
        dbDir,
        params,
      };

      child.send(request, (error) => {
        if (!error) {
          return;
        }

        const entry = this.pending.get(id);
        if (!entry) {
          return;
        }

        clearTimeout(entry.timeout);
        this.pending.delete(id);
        reject(error);
      });
    });
  }

  dispose(): void {
    if (this.child) {
      this.child.kill();
      this.child = null;
    }
  }

  private ensureChild(): ChildProcess {
    if (this.child && this.child.connected) {
      return this.child;
    }

    const workerScript = path.join(__dirname, 'KuzuNativeProcess.js');
    const child = fork(workerScript, [], {
      execPath: this.resolveNodeExecutable(),
      env: { ...process.env },
      stdio: ['ignore', 'pipe', 'pipe', 'ipc'],
    });

    child.on('message', (message) => {
      this.handleMessage(message);
    });

    child.on('exit', (code, signal) => {
      const reason =
        code !== null
          ? `Kuzu background worker exited with code ${code}`
          : `Kuzu background worker exited with signal ${signal ?? 'unknown'}`;
      this.rejectAllPending(new Error(reason));
      this.child = null;
    });

    child.on('error', (error) => {
      this.rejectAllPending(error);
      this.child = null;
    });

    child.stdout?.on('data', (chunk: Buffer | string) => {
      const text = chunk.toString().trim();
      if (text) {
        console.log(`[KuzuWorker] ${text}`);
      }
    });

    child.stderr?.on('data', (chunk: Buffer | string) => {
      const text = chunk.toString().trim();
      if (text) {
        console.error(`[KuzuWorker] ${text}`);
      }
    });

    this.child = child;
    return child;
  }

  private handleMessage(message: unknown): void {
    if (!message || typeof message !== 'object') {
      return;
    }

    const response = message as Partial<KuzuResponse>;
    if (typeof response.id !== 'number' || typeof response.ok !== 'boolean') {
      return;
    }

    const entry = this.pending.get(response.id);
    if (!entry) {
      return;
    }

    clearTimeout(entry.timeout);
    this.pending.delete(response.id);

    if (response.ok) {
      entry.resolve(response.result);
      return;
    }

    const errorMessage = response.error?.message ?? 'Unknown Kuzu worker error';
    const error = new Error(errorMessage);
    error.name = response.error?.name ?? 'KuzuWorkerError';
    if (response.error?.stack) {
      error.stack = response.error.stack;
    }
    entry.reject(error);
  }

  private rejectAllPending(error: Error): void {
    for (const [id, entry] of this.pending.entries()) {
      clearTimeout(entry.timeout);
      entry.reject(error);
      this.pending.delete(id);
    }
  }

  private resolveNodeExecutable(): string {
    const candidates = [
      process.env.CODEMAPS_NODE_EXECUTABLE,
      process.env.npm_node_execpath,
      process.env.NODE,
    ].filter((candidate): candidate is string => Boolean(candidate));

    for (const candidate of candidates) {
      if (candidate === 'node' || fs.existsSync(candidate)) {
        return candidate;
      }
    }

    return 'node';
  }
}

export class KuzuGraphService {
  private static readonly processManager = KuzuProcessManager.getInstance();

  private dbPath: string;
  private dbDir: string;
  private initialized: boolean = false;

  constructor(projectPath?: string) {
    if (projectPath) {
      this.dbDir = path.join(projectPath, '.codemaps');
      this.dbPath = path.join(this.dbDir, 'graph.db');
    } else {
      this.dbDir = path.join(os.tmpdir(), 'codemaps-graph');
      this.dbPath = path.join(this.dbDir, 'graph.db');
    }

    if (!fs.existsSync(this.dbDir)) {
      fs.mkdirSync(this.dbDir, { recursive: true });
    }
  }

  async init(): Promise<void> {
    if (this.initialized) return;
    await this.invoke<void>('init');
    this.initialized = true;
  }

  async addNode(node: GraphNode): Promise<void> {
    if (!this.initialized) await this.init();
    await this.invoke<void>('addNode', { node });
  }

  async addEdge(edge: GraphEdge): Promise<void> {
    if (!this.initialized) await this.init();
    await this.invoke<void>('addEdge', { edge });
  }

  async queryNodes(type?: string, filePath?: string): Promise<any[]> {
    if (!this.initialized) await this.init();
    return this.invoke<any[]>('queryNodes', { type, filePath });
  }

  async queryNeighbors(nodeId: string): Promise<any[]> {
    if (!this.initialized) await this.init();
    return this.invoke<any[]>('queryNeighbors', { nodeId });
  }

  async query(cypherQuery: string): Promise<SerializableQueryResult> {
    if (!this.initialized) await this.init();
    const rows = await this.invoke<Record<string, unknown>[]>('query', { query: cypherQuery });
    return new SerializableQueryResult(rows);
  }

  async getStats(): Promise<{ nodes: number; edges: number }> {
    if (!this.initialized) await this.init();
    return this.invoke<{ nodes: number; edges: number }>('getStats');
  }

  async clear(): Promise<void> {
    if (!this.initialized) return;
    await this.invoke<void>('clear');
  }

  async close(): Promise<void> {
    if (!this.initialized) {
      return;
    }

    await this.invoke<void>('close');
    this.initialized = false;
  }

  private async invoke<T>(action: KuzuAction, params?: Record<string, unknown>): Promise<T> {
    return KuzuGraphService.processManager.request<T>(action, this.dbPath, this.dbDir, params);
  }
}

let instance: KuzuGraphService | null = null;
export function getKuzuGraphService(projectPath?: string): KuzuGraphService {
  if (!instance) {
    instance = new KuzuGraphService(projectPath);
  }
  return instance;
}
