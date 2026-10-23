import { ChildProcess, fork } from 'child_process';
import * as path from 'path';
import * as fs from 'fs';
import type { Readable } from 'stream';

export type KuzuAction =
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

export class SerializableQueryResult {
  constructor(private readonly rows: Record<string, unknown>[]) {}

  async getAll(): Promise<Record<string, unknown>[]> {
    return this.rows;
  }
}

/**
 * The worker runs under a system Node (Kuzu's native module crashes inside Electron's
 * runtime), and Node cannot read app.asar, so a packaged build ships the script unpacked.
 */
export const resolveWorkerScript = (directory: string): string => {
  const script = path.join(directory, 'KuzuNativeProcess.js');
  return script.replace(/app\.asar(?=[\\/])/, 'app.asar.unpacked');
};

const resolveNodeExecutable = (): string => {
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
};

const forwardOutput = (stream: Readable | null, log: (message: string) => void) => {
  stream?.on('data', (chunk: Buffer | string) => {
    const text = chunk.toString().trim();
    if (text) {
      log(`[KuzuWorker] ${text}`);
    }
  });
};

const toWorkerError = (response: Partial<KuzuResponse>): Error => {
  const error = new Error(response.error?.message ?? 'Unknown Kuzu worker error');
  error.name = response.error?.name ?? 'KuzuWorkerError';
  if (response.error?.stack) {
    error.stack = response.error.stack;
  }
  return error;
};

export class KuzuProcessManager {
  private static instance: KuzuProcessManager | null = null;

  private child: ChildProcess | null = null;
  private nextRequestId = 1;
  private readonly pending = new Map<
    number,
    {
      resolve: (value: unknown) => void;
      reject: (reason?: unknown) => void;
      timeout: ReturnType<typeof setTimeout>;
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

  async request<T>(
    action: KuzuAction,
    dbPath: string,
    dbDir: string,
    params?: Record<string, unknown>
  ): Promise<T> {
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

      const request: KuzuRequest = { id, action, dbPath, dbDir, params };

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
    this.rejectAllPending(new Error('Kuzu background worker disposed'));

    if (this.child) {
      this.child.kill();
      this.child = null;
    }
  }

  private ensureChild(): ChildProcess {
    if (this.child && this.child.connected) {
      return this.child;
    }

    const child = fork(resolveWorkerScript(__dirname), [], {
      execPath: resolveNodeExecutable(),
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

    forwardOutput(child.stdout, (text) => console.log(text));
    forwardOutput(child.stderr, (text) => console.error(text));

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

    entry.reject(toWorkerError(response));
  }

  private rejectAllPending(error: Error): void {
    for (const [id, entry] of this.pending.entries()) {
      clearTimeout(entry.timeout);
      entry.reject(error);
      this.pending.delete(id);
    }
  }
}
