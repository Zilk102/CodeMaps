/** Entry point of the child process that owns the native Kuzu database; answers IPC requests from `KuzuProcessManager`. */

import { KuzuGraphRepository, GraphNode, GraphEdge } from './KuzuGraphRepository';

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

const repositories = new Map<string, KuzuGraphRepository>();
const taskChains = new Map<string, Promise<unknown>>();

function getRepository(dbPath: string, dbDir: string): KuzuGraphRepository {
  let repo = repositories.get(dbPath);
  if (!repo) {
    repo = new KuzuGraphRepository(dbPath, dbDir);
    repositories.set(dbPath, repo);
  }
  return repo;
}

/** Runs `task` after every earlier task for the same database finished (successfully or not), so operations on one database never overlap. */
function runSerialized<T>(dbPath: string, task: () => Promise<T>): Promise<T> {
  const previous = taskChains.get(dbPath) ?? Promise.resolve();
  const current = previous.catch(() => undefined).then(task);

  taskChains.set(dbPath, current);
  return current.finally(() => {
    if (taskChains.get(dbPath) === current) {
      taskChains.delete(dbPath);
    }
  });
}

/** Whether an IPC payload has the shape of a Kuzu request. Other messages are ignored. */
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

/** Converts a thrown value into a plain object that can cross the IPC channel. */
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

type ActionParams = Record<string, unknown>;

/** What one action does with the repository; `null` results mean "done, nothing to return". */
type ActionHandler = (
  repo: KuzuGraphRepository,
  params: ActionParams,
  request: KuzuRequest
) => Promise<unknown>;

const stringOrUndefined = (value: unknown) => (typeof value === 'string' ? value : undefined);

const ACTION_HANDLERS: Record<KuzuAction, ActionHandler> = {
  init: async (repo) => {
    await repo.init();
    return null;
  },
  addNode: async (repo, params) => {
    await repo.addNode(params.node as GraphNode);
    return null;
  },
  addEdge: async (repo, params) => {
    await repo.addEdge(params.edge as GraphEdge);
    return null;
  },
  query: async (repo, params) => repo.query(String(params.query ?? '')),
  queryNodes: async (repo, params) =>
    repo.queryNodes(stringOrUndefined(params.type), stringOrUndefined(params.filePath)),
  queryNeighbors: async (repo, params) => repo.queryNeighbors(String(params.nodeId ?? '')),
  getStats: async (repo) => repo.getStats(),
  clear: async (repo) => {
    await repo.clear();
    return null;
  },
  close: async (repo, _params, request) => {
    await repo.close();
    repositories.delete(request.dbPath);
    return null;
  },
};

async function executeRequest(request: KuzuRequest): Promise<unknown> {
  const repo = getRepository(request.dbPath, request.dbDir);
  if (!Object.prototype.hasOwnProperty.call(ACTION_HANDLERS, request.action)) {
    throw new Error(`Unsupported Kuzu action: ${String(request.action)}`);
  }
  return ACTION_HANDLERS[request.action](repo, request.params ?? {}, request);
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
