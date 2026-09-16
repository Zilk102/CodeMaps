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
  const repo = getRepository(request.dbPath, request.dbDir);

  switch (request.action) {
    case 'init':
      await repo.init();
      return null;
    case 'addNode':
      await repo.addNode(request.params?.node as GraphNode);
      return null;
    case 'addEdge':
      await repo.addEdge(request.params?.edge as GraphEdge);
      return null;
    case 'query':
      return repo.query(String(request.params?.query ?? ''));
    case 'queryNodes':
      return repo.queryNodes(
        typeof request.params?.type === 'string' ? request.params.type : undefined,
        typeof request.params?.filePath === 'string' ? request.params.filePath : undefined
      );
    case 'queryNeighbors':
      return repo.queryNeighbors(String(request.params?.nodeId ?? ''));
    case 'getStats':
      return repo.getStats();
    case 'clear':
      await repo.clear();
      return null;
    case 'close':
      await repo.close();
      repositories.delete(request.dbPath);
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
