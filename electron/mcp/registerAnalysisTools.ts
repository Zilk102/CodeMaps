import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import * as z from 'zod/v4';
import { ensureGraphLoaded } from './utils';
import { McpToolContext } from './toolContext';
import { okStatusToolResult } from './toolSupport';

export function registerAnalysisTools(server: McpServer, context: McpToolContext) {
  server.registerTool(
    'get_health_score',
    {
      title: 'Get Health Score',
      description: 'Compute structural graph health metrics and an overall score',
      inputSchema: {},
    },
    async () => {
      const graph = await ensureGraphLoaded();
      const health = context.healthScoreAnalyzer.analyze(graph);
      return okStatusToolResult({ health });
    }
  );

  server.registerTool(
    'get_architecture_overview',
    {
      title: 'Get Architecture Overview',
      description:
        'Return architectural layer classification, cross-layer dependencies and boundary violations',
      inputSchema: {
        includeClassifications: z
          .boolean()
          .optional()
          .describe('When true, include per-node layer classifications'),
      },
    },
    async ({ includeClassifications = false }: { includeClassifications?: boolean }) => {
      const graph = await ensureGraphLoaded();
      const overview = context.architectureInsightService.analyze(graph);
      return okStatusToolResult({
        architecture: includeClassifications
          ? overview
          : {
              layers: overview.layers,
              dependencies: overview.dependencies,
              violations: overview.violations,
              summary: overview.summary,
            },
      });
    }
  );

  server.registerTool(
    'detect_patterns',
    {
      title: 'Detect Patterns',
      description: 'Detect architectural hotspots and anti-pattern candidates in the graph',
      inputSchema: {
        limit: z
          .number()
          .int()
          .min(1)
          .max(100)
          .optional()
          .describe('Optional maximum number of patterns to return'),
      },
    },
    async ({ limit = 20 }: { limit?: number }) => {
      const graph = await ensureGraphLoaded();
      const result = context.patternDetectionAnalyzer.analyze(graph);
      return okStatusToolResult({
        count: Math.min(result.patterns.length, limit),
        patterns: result.patterns.slice(0, limit),
      });
    }
  );

  server.registerTool(
    'run_security_scan',
    {
      title: 'Run Security Scan',
      description: 'Scan indexed source files for high-risk patterns and suspicious artifacts',
      inputSchema: {
        limit: z
          .number()
          .int()
          .min(1)
          .max(500)
          .optional()
          .describe('Optional maximum number of findings to return'),
      },
    },
    async ({ limit = 100 }: { limit?: number }) => {
      const graph = await ensureGraphLoaded();
      const scan = await context.securityScanner.analyze(graph);
      return okStatusToolResult({
        summary: scan.summary,
        findings: scan.findings.slice(0, limit),
      });
    }
  );

  server.registerTool(
    'search_signatures',
    {
      title: 'Search Signatures',
      description: 'Search declaration-like code signatures across indexed source files',
      inputSchema: {
        query: z.string().describe('Text or regex pattern to search in declaration signatures'),
        type: z
          .string()
          .optional()
          .describe('Optional symbol type filter such as function or class'),
        limit: z
          .number()
          .int()
          .min(1)
          .max(100)
          .optional()
          .describe('Maximum number of matches to return'),
        caseSensitive: z.boolean().optional().describe('Enable case-sensitive matching'),
        regex: z.boolean().optional().describe('Treat query as a regular expression'),
      },
    },
    async ({
      query,
      type,
      limit = 20,
      caseSensitive = false,
      regex = false,
    }: {
      query: string;
      type?: string;
      limit?: number;
      caseSensitive?: boolean;
      regex?: boolean;
    }) => {
      const graph = await ensureGraphLoaded();
      const result = await context.signatureSearchService.search(graph, query, {
        type,
        limit,
        caseSensitive,
        regex,
      });
      return okStatusToolResult(result);
    }
  );
}
