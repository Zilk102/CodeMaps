import { GraphData } from '../store';
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
