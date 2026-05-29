import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import * as z from 'zod/v4';
import { BlastRadiusV2 } from '../services/BlastRadiusV2';
import { GitActivityService } from '../services/GitActivityService';
import { PRImpactAnalyzer } from '../services/PRImpactAnalyzer';
import { ensureGraphLoaded } from './utils';
import { okStatusToolResult, requireProjectRoot } from './toolSupport';

export function registerAdvancedTools(server: McpServer) {
  server.registerTool(
    'analyze_pr_impact',
    {
      title: 'Analyze PR Impact',
      description: 'Analyze the architectural blast radius of a PR or branch comparison',
      inputSchema: {
        baseBranch: z.string().describe('Base branch name to compare against'),
        headBranch: z.string().describe('Head branch name with changes'),
      },
    },
    async ({ baseBranch, headBranch }: { baseBranch: string; headBranch: string }) => {
      const graph = await ensureGraphLoaded();
      const projectRoot = requireProjectRoot(graph, 'run PR impact analysis');

      const analyzer = new PRImpactAnalyzer(projectRoot);
      await analyzer.init();
      try {
        const result = await analyzer.analyzePR(baseBranch, headBranch);
        return okStatusToolResult(result);
      } finally {
        await analyzer.close();
      }
    }
  );

  server.registerTool(
    'analyze_activity_heatmap',
    {
      title: 'Analyze Activity Heatmap',
      description: 'Generate a git churn heatmap to identify hotspots',
      inputSchema: {
        since: z.string().optional().describe('ISO date string for start of period'),
        until: z.string().optional().describe('ISO date string for end of period'),
      },
    },
    async ({ since, until }: { since?: string; until?: string }) => {
      const graph = await ensureGraphLoaded();
      const projectRoot = requireProjectRoot(graph, 'run heatmap analysis');

      const service = new GitActivityService(projectRoot);
      await service.init();
      try {
        const result = service.analyzeChurn(
          since ? new Date(since) : undefined,
          until ? new Date(until) : undefined
        );
        return okStatusToolResult(result);
      } finally {
        await service.close();
      }
    }
  );

  server.registerTool(
    'calculate_blast_radius_v2',
    {
      title: 'Calculate Blast Radius V2',
      description: 'Return advanced direct and transitive impact using KuzuDB',
      inputSchema: {
        nodeId: z.string().describe('Exact node id from the graph'),
        maxDepth: z
          .number()
          .int()
          .min(1)
          .max(20)
          .optional()
          .describe('Optional traversal depth limit'),
      },
    },
    async ({ nodeId, maxDepth }: { nodeId: string; maxDepth?: number }) => {
      const graph = await ensureGraphLoaded();
      const projectRoot = requireProjectRoot(graph, 'calculate blast radius v2');

      const analyzer = new BlastRadiusV2(projectRoot);
      await analyzer.init();
      try {
        const result = await analyzer.calculate(nodeId, maxDepth || 5);
        return okStatusToolResult(result);
      } finally {
        await analyzer.close();
      }
    }
  );
}
