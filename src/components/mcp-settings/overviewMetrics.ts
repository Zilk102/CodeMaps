import type { GraphData } from '../../types/graph';
import type { McpStatus } from './types';

/** Tool count shown on the overview: detailed list first, then the plain name list. */
export const countTools = (status: McpStatus | null): number =>
  (status?.toolDetails || []).length || status?.tools.length || 0;

export const countResources = (status: McpStatus | null): number =>
  (status?.resourceDetails || []).length || status?.resources.length || 0;

/** "nodes / links" label, preferring the server-reported counts over the loaded graph. */
export const graphMetricLabel = (status: McpStatus | null, graphData: GraphData | null): string =>
  graphData
    ? `${status?.nodesCount || graphData.nodes.length} / ${status?.linksCount || graphData.links.length}`
    : '0 / 0';
