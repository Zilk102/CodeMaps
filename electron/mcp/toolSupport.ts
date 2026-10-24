/** Shared building blocks for MCP tool handlers: result envelopes, size bounding and lookup guards. */

import { GraphData } from '../store';
import { compactPayload, CompactOptions } from './compactPayload';
import { createTextContent, resolveNodeReference } from './utils';

/** Wraps `payload` as a successful text tool response; strings pass through, other values become indented JSON. No size bounding is applied. */
export const okToolResult = (payload: unknown) => ({
  content: [
    {
      type: 'text' as const,
      text: createTextContent(payload),
    },
  ],
});

/** Controls how `okStatusToolResult` bounds the response size. */
export interface ToolResultOptions {
  /** Longest list kept in the response. */
  limit?: number;
  /** Skip all size bounding; for payloads that are already capped or deliberately complete. */
  unbounded?: boolean;
}

const DEFAULT_RESULT_ITEMS = 100;
const DEFAULT_RESULT_CHARS = 40_000;
const DEFAULT_RESULT_STRING = 2_000;

/**
 * Standard successful tool response. Every list is cut to `limit` items and the whole
 * payload stays under a size budget, so no single call can flood an agent's context;
 * whatever was cut is described under `_compaction`.
 */
export const okStatusToolResult = (payload: unknown, options: ToolResultOptions = {}) => {
  const body = (
    typeof payload === 'object' && payload !== null ? payload : { value: payload }
  ) as Record<string, unknown>;

  if (options.unbounded) {
    return okToolResult({ status: 'ok', ...body });
  }

  return okCompactStatusToolResult(body, options.limit ?? DEFAULT_RESULT_ITEMS, {
    maxChars: DEFAULT_RESULT_CHARS,
    maxStringLength: DEFAULT_RESULT_STRING,
  });
};

/**
 * Result for composite `prepare_*` tools: bounded to `limit` items per list, to a size budget and
 * serialized without indentation, so one call cannot flood the agent's context.
 */
export const okCompactStatusToolResult = (
  payload: Record<string, unknown>,
  limit: number,
  options: Partial<CompactOptions> = {}
) => {
  const { payload: compacted, compaction } = compactPayload(payload, {
    maxItems: limit,
    // A larger `limit` is an explicit request for more detail, so the size budget grows with it.
    maxChars: 8_000 + 2_000 * limit,
    ...options,
  });
  return {
    content: [
      {
        type: 'text' as const,
        text: JSON.stringify({
          status: 'ok',
          ...compacted,
          ...(compaction ? { _compaction: compaction } : {}),
        }),
      },
    ],
  };
};

/** Tool response with `isError` set and a JSON body of `{ status: "error", message }`. */
export const errorToolResult = (message: string) => ({
  content: [
    {
      type: 'text' as const,
      text: createTextContent({ status: 'error', message }),
    },
  ],
  isError: true,
});

/** Returns the graph's project root, throwing "Project root is required to <action>" when no project is loaded. */
export const requireProjectRoot = (graph: GraphData, action: string) => {
  if (!graph.projectRoot) {
    throw new Error(`Project root is required to ${action}`);
  }

  return graph.projectRoot;
};

/**
 * Resolves a node reference (id, absolute path or project-relative path) to a graph node, or
 * returns the standard "Node not found" tool error.
 */
export const lookupNode = (graph: GraphData, reference: string) => {
  const nodeId = resolveNodeReference(graph, reference);
  const node = graph.nodes.find((candidate) => candidate.id === nodeId);
  if (!node) {
    return {
      nodeId,
      error: errorToolResult(
        `Node not found: ${nodeId}. Pass the node id from the graph, an absolute path, or a path relative to the project root.`
      ),
    };
  }
  return { nodeId, node };
};

/** Runs `run` against a service that needs `init()` before use and `close()` afterwards. */
export const withInitializedService = async <
  S extends { init(): Promise<unknown>; close(): Promise<unknown> },
  R,
>(
  service: S,
  run: (service: S) => Promise<R> | R
): Promise<R> => {
  await service.init();
  try {
    return await run(service);
  } finally {
    await service.close();
  }
};
