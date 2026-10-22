import { GraphData } from '../store';
import { compactPayload, CompactOptions } from './compactPayload';
import { createTextContent } from './utils';

export const okToolResult = (payload: unknown) => ({
  content: [
    {
      type: 'text' as const,
      text: createTextContent(payload),
    },
  ],
});

export const okStatusToolResult = (payload: unknown) =>
  okToolResult({
    status: 'ok',
    ...((typeof payload === 'object' && payload !== null ? payload : { value: payload }) as Record<
      string,
      unknown
    >),
  });

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

export const errorToolResult = (message: string) => ({
  content: [
    {
      type: 'text' as const,
      text: createTextContent({ status: 'error', message }),
    },
  ],
  isError: true,
});

export const requireProjectRoot = (graph: GraphData, action: string) => {
  if (!graph.projectRoot) {
    throw new Error(`Project root is required to ${action}`);
  }

  return graph.projectRoot;
};
