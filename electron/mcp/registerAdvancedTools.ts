import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import * as z from 'zod/v4';
import { BlastRadiusV2 } from '../services/BlastRadiusV2';
import { GitActivityService } from '../services/GitActivityService';
import { PRImpactAnalyzer } from '../services/PRImpactAnalyzer';
import { defineGraphTool } from './defineTool';
import { resolveNodeReference } from './utils';
import { boundedInt, nodeIdField, optionalString } from './toolSchemas';
import { okStatusToolResult, requireProjectRoot, withInitializedService } from './toolSupport';

export function registerAdvancedTools(server: McpServer) {
  registerAnalyzePrImpact(server);
  registerActivityHeatmap(server);
  registerBlastRadiusV2(server);
}

function registerAnalyzePrImpact(server: McpServer) {
  defineGraphTool(
    server,
    {
      name: 'analyze_pr_impact',
      title: 'Analyze PR Impact',
      description: 'Analyze the architectural blast radius of a PR or branch comparison',
      inputSchema: {
        baseBranch: z.string().describe('Base branch name to compare against'),
        headBranch: z.string().describe('Head branch name with changes'),
      },
    },
    async (graph, { baseBranch, headBranch }) => {
      const projectRoot = requireProjectRoot(graph, 'run PR impact analysis');

      return withInitializedService(new PRImpactAnalyzer(projectRoot), async (analyzer) =>
        okStatusToolResult(await analyzer.analyzePR(baseBranch, headBranch))
      );
    }
  );
}

function registerActivityHeatmap(server: McpServer) {
  defineGraphTool(
    server,
    {
      name: 'analyze_activity_heatmap',
      title: 'Analyze Activity Heatmap',
      description: 'Generate a git churn heatmap to identify hotspots',
      inputSchema: {
        since: optionalString('ISO date string for start of period'),
        until: optionalString('ISO date string for end of period'),
      },
    },
    async (graph, { since, until }) => {
      const projectRoot = requireProjectRoot(graph, 'run heatmap analysis');

      return withInitializedService(new GitActivityService(projectRoot), (service) =>
        okStatusToolResult(
          service.analyzeChurn(
            since ? new Date(since) : undefined,
            until ? new Date(until) : undefined
          )
        )
      );
    }
  );
}

function registerBlastRadiusV2(server: McpServer) {
  defineGraphTool(
    server,
    {
      name: 'calculate_blast_radius_v2',
      title: 'Calculate Blast Radius V2',
      description: 'Return advanced direct and transitive impact using KuzuDB',
      inputSchema: {
        nodeId: nodeIdField,
        maxDepth: boundedInt(20, 'Optional traversal depth limit'),
      },
    },
    async (graph, { nodeId, maxDepth }) => {
      const projectRoot = requireProjectRoot(graph, 'calculate blast radius v2');

      return withInitializedService(new BlastRadiusV2(projectRoot), async (analyzer) =>
        okStatusToolResult(
          await analyzer.calculate(resolveNodeReference(graph, nodeId), maxDepth || 5)
        )
      );
    }
  );
}
