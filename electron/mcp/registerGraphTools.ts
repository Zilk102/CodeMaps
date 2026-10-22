import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import * as path from 'path';
import * as z from 'zod/v4';
import { summarizeBlastRadius } from '../analysis/blastRadiusSummary';
import { oracleStore } from '../store';
import { createGraphSummary, ensureGraphLoaded, getNodeDependencies, searchGraph } from './utils';
import { McpToolContext } from './toolContext';
import { errorToolResult, okStatusToolResult } from './toolSupport';

export function registerGraphTools(server: McpServer, context: McpToolContext) {
  server.registerTool(
    'analyze_project',
    {
      title: 'Analyze Project',
      description: 'Analyze a project directory and load it into CodeMaps',
      inputSchema: {
        projectPath: z
          .string()
          .optional()
          .describe('Absolute project path. Defaults to the current open project or process cwd.'),
      },
    },
    async ({ projectPath }: { projectPath?: string }) => {
      const graph = await ensureGraphLoaded(projectPath);
      const summary = createGraphSummary(graph);

      if (graph.projectRoot) {
        const projectName = path.basename(graph.projectRoot);
        oracleStore
          .getState()
          .addRecentProject(graph.projectRoot, projectName, graph.refreshTelemetry);
      }

      return okStatusToolResult({ summary });
    }
  );

  server.registerTool(
    'get_graph_context',
    {
      title: 'Get Graph Context',
      description: 'Return the graph or a compact graph summary for the loaded project',
      inputSchema: {
        includeFullGraph: z
          .boolean()
          .optional()
          .describe('When true, return the full graph payload.'),
      },
    },
    async ({ includeFullGraph = false }: { includeFullGraph?: boolean }) => {
      const graph = await ensureGraphLoaded();
      const payload = includeFullGraph
        ? {
            ...graph,
            nodes: graph.nodes.slice(0, 1000),
            links: graph.links.slice(0, 2000),
            truncated: graph.nodes.length > 1000 || graph.links.length > 2000,
          }
        : createGraphSummary(graph);

      return okStatusToolResult(payload, { unbounded: true });
    }
  );

  server.registerTool(
    'get_node_dependencies',
    {
      title: 'Get Node Dependencies',
      description:
        'Return incoming and outgoing links for a graph node. For a file node it covers the symbols inside it and lists every neighbouring file once (dependentFiles, dependencyFiles).',
      inputSchema: {
        nodeId: z.string().describe('Exact node id from the graph'),
        limit: z
          .number()
          .int()
          .min(1)
          .max(500)
          .optional()
          .describe(
            'Maximum raw links per direction (default 25); the per-file lists are complete'
          ),
      },
    },
    async ({ nodeId, limit }: { nodeId: string; limit?: number }) => {
      const graph = await ensureGraphLoaded();
      const node = graph.nodes.find((candidate) => candidate.id === nodeId);

      if (!node) {
        return errorToolResult(`Node not found: ${nodeId}`);
      }

      return okStatusToolResult({
        node,
        ...getNodeDependencies(graph, nodeId, limit),
      });
    }
  );

  server.registerTool(
    'search_graph',
    {
      title: 'Search Graph',
      description: 'Search nodes by label or id with optional type filter',
      inputSchema: {
        query: z.string().describe('Free-text query to search in node labels and ids'),
        type: z
          .string()
          .optional()
          .describe('Optional node type filter such as file, directory, class, function, adr'),
        limit: z
          .number()
          .int()
          .min(1)
          .max(100)
          .optional()
          .describe('Maximum number of matches to return'),
      },
    },
    async ({ query, type, limit = 20 }: { query: string; type?: string; limit?: number }) => {
      const graph = await ensureGraphLoaded();
      const matches = searchGraph(graph, query, type, limit);
      return okStatusToolResult({ count: matches.length, matches });
    }
  );

  server.registerTool(
    'get_blast_radius',
    {
      title: 'Get Blast Radius',
      description:
        'Return the impact of changing a node: files grouped by area, the direct dependents, and only the nearest indirect ones. Use detail "full" for the raw node-level result.',
      inputSchema: {
        nodeId: z.string().describe('Exact node id from the graph'),
        depth: z
          .number()
          .int()
          .min(1)
          .max(20)
          .optional()
          .describe('Optional traversal depth limit'),
        limit: z
          .number()
          .int()
          .min(1)
          .max(200)
          .optional()
          .describe('Maximum files listed per section (default 15); counts are always complete'),
        detail: z
          .enum(['summary', 'full'])
          .optional()
          .describe('summary (default) or the raw node-level result'),
      },
    },
    async ({
      nodeId,
      depth = 3,
      limit = 15,
      detail = 'summary',
    }: {
      nodeId: string;
      depth?: number;
      limit?: number;
      detail?: 'summary' | 'full';
    }) => {
      const graph = await ensureGraphLoaded();
      const node = graph.nodes.find((candidate) => candidate.id === nodeId);

      if (!node) {
        return errorToolResult(`Node not found: ${nodeId}`);
      }

      const impact = context.blastRadiusAnalyzer.analyze(graph, nodeId, depth);
      if (detail === 'full') {
        return okStatusToolResult({ nodeId, impact });
      }
      return okStatusToolResult({ nodeId, impact: summarizeBlastRadius(graph, impact, limit) });
    }
  );
}
