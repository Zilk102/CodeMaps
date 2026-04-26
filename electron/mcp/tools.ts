import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import * as path from 'path';
import * as z from 'zod/v4';

import { BlastRadiusAnalyzer } from '../analysis/BlastRadiusAnalyzer';
import { HealthScoreAnalyzer } from '../analysis/HealthScoreAnalyzer';
import { PatternDetectionAnalyzer } from '../analysis/PatternDetectionAnalyzer';
import { SecurityScanner } from '../analysis/SecurityScanner';
import { SignatureSearchService } from '../analysis/SignatureSearchService';
import { ArchitectureInsightService } from '../analysis/ArchitectureInsightService';
import { AgentContextService } from '../analysis/AgentContextService';
import { ProjectInsightService } from '../analysis/ProjectInsightService';
import { TaskIntelligenceService } from '../analysis/TaskIntelligenceService';
import { ChangeCampaignService } from '../analysis/ChangeCampaignService';

import { PRImpactAnalyzer } from '../services/PRImpactAnalyzer.js';
import { GitActivityService } from '../services/GitActivityService.js';
import { BlastRadiusV2 } from '../services/BlastRadiusV2.js';

import {
  ensureGraphLoaded,
  createGraphSummary,
  createTextContent,
  getNodeDependencies,
  searchGraph,
} from './utils';
import { oracleStore } from '../store';

export function registerTools(
  server: McpServer,
  services: {
    blastRadiusAnalyzer: BlastRadiusAnalyzer;
    healthScoreAnalyzer: HealthScoreAnalyzer;
    patternDetectionAnalyzer: PatternDetectionAnalyzer;
    securityScanner: SecurityScanner;
    signatureSearchService: SignatureSearchService;
    architectureInsightService: ArchitectureInsightService;
    agentContextService: AgentContextService;
    projectInsightService: ProjectInsightService;
    taskIntelligenceService: TaskIntelligenceService;
    changeCampaignService: ChangeCampaignService;
  }
) {
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
    async ({ projectPath }) => {
      const graph = await ensureGraphLoaded(projectPath);
      const summary = createGraphSummary(graph);

      if (graph.projectRoot) {
        const projectName = path.basename(graph.projectRoot);
        oracleStore.getState().addRecentProject(graph.projectRoot, projectName);
      }

      return {
        content: [
          {
            type: 'text',
            text: createTextContent({
              status: 'ok',
              summary,
            }),
          },
        ],
      };
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
    async ({ includeFullGraph = false }) => {
      const graph = await ensureGraphLoaded();
      const payload = includeFullGraph ? graph : createGraphSummary(graph);
      return {
        content: [
          {
            type: 'text',
            text: createTextContent(payload),
          },
        ],
      };
    }
  );

  server.registerTool(
    'get_node_dependencies',
    {
      title: 'Get Node Dependencies',
      description: 'Return outgoing and incoming links for a specific graph node',
      inputSchema: {
        nodeId: z.string().describe('Exact node id from the graph'),
      },
    },
    async ({ nodeId }) => {
      const graph = await ensureGraphLoaded();
      const node = graph.nodes.find((candidate) => candidate.id === nodeId);

      if (!node) {
        return {
          content: [
            {
              type: 'text',
              text: createTextContent({ status: 'error', message: `Node not found: ${nodeId}` }),
            },
          ],
          isError: true,
        };
      }

      return {
        content: [
          {
            type: 'text',
            text: createTextContent({
              status: 'ok',
              node,
              ...getNodeDependencies(graph, nodeId),
            }),
          },
        ],
      };
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
    async ({ query, type, limit = 20 }) => {
      const graph = await ensureGraphLoaded();
      const matches = searchGraph(graph, query, type, limit);
      return {
        content: [
          {
            type: 'text',
            text: createTextContent({
              status: 'ok',
              count: matches.length,
              matches,
            }),
          },
        ],
      };
    }
  );

  server.registerTool(
    'get_blast_radius',
    {
      title: 'Get Blast Radius',
      description: 'Return direct and transitive impact for changing a node',
      inputSchema: {
        nodeId: z.string().describe('Exact node id from the graph'),
        depth: z
          .number()
          .int()
          .min(1)
          .max(20)
          .optional()
          .describe('Optional traversal depth limit'),
      },
    },
    async ({ nodeId, depth }) => {
      const graph = await ensureGraphLoaded();
      const node = graph.nodes.find((candidate) => candidate.id === nodeId);

      if (!node) {
        return {
          content: [
            {
              type: 'text',
              text: createTextContent({ status: 'error', message: `Node not found: ${nodeId}` }),
            },
          ],
          isError: true,
        };
      }

      const blastRadius = services.blastRadiusAnalyzer.analyze(graph, nodeId, depth);
      return {
        content: [
          {
            type: 'text',
            text: createTextContent({
              status: 'ok',
              node,
              blastRadius,
            }),
          },
        ],
      };
    }
  );

  server.registerTool(
    'get_health_score',
    {
      title: 'Get Health Score',
      description: 'Compute structural graph health metrics and an overall score',
      inputSchema: {},
    },
    async () => {
      const graph = await ensureGraphLoaded();
      const health = services.healthScoreAnalyzer.analyze(graph);
      return {
        content: [
          {
            type: 'text',
            text: createTextContent({
              status: 'ok',
              health,
            }),
          },
        ],
      };
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
    async ({ includeClassifications = false }) => {
      const graph = await ensureGraphLoaded();
      const overview = services.architectureInsightService.analyze(graph);
      return {
        content: [
          {
            type: 'text',
            text: createTextContent({
              status: 'ok',
              architecture: includeClassifications
                ? overview
                : {
                    layers: overview.layers,
                    dependencies: overview.dependencies,
                    violations: overview.violations,
                    summary: overview.summary,
                  },
            }),
          },
        ],
      };
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
    async ({ limit = 20 }) => {
      const graph = await ensureGraphLoaded();
      const result = services.patternDetectionAnalyzer.analyze(graph);
      return {
        content: [
          {
            type: 'text',
            text: createTextContent({
              status: 'ok',
              count: Math.min(result.patterns.length, limit),
              patterns: result.patterns.slice(0, limit),
            }),
          },
        ],
      };
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
    async ({ limit = 100 }) => {
      const graph = await ensureGraphLoaded();
      const scan = await services.securityScanner.analyze(graph);
      return {
        content: [
          {
            type: 'text',
            text: createTextContent({
              status: 'ok',
              summary: scan.summary,
              findings: scan.findings.slice(0, limit),
            }),
          },
        ],
      };
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
    async ({ query, type, limit = 20, caseSensitive = false, regex = false }) => {
      const graph = await ensureGraphLoaded();
      const result = await services.signatureSearchService.search(graph, query, {
        type,
        limit,
        caseSensitive,
        regex,
      });
      return {
        content: [
          {
            type: 'text',
            text: createTextContent({
              status: 'ok',
              ...result,
            }),
          },
        ],
      };
    }
  );

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
    async ({ baseBranch, headBranch }) => {
      const graph = await ensureGraphLoaded();
      if (!graph.projectRoot) {
        throw new Error('Project root is required to run PR impact analysis');
      }
      
      const analyzer = new PRImpactAnalyzer(graph.projectRoot);
      await analyzer.init();
      try {
        const result = await analyzer.analyzePR(baseBranch, headBranch);
        return {
          content: [
            {
              type: 'text',
              text: createTextContent({ status: 'ok', ...result }),
            },
          ],
        };
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
    async ({ since, until }) => {
      const graph = await ensureGraphLoaded();
      if (!graph.projectRoot) {
        throw new Error('Project root is required to run heatmap analysis');
      }

      const service = new GitActivityService(graph.projectRoot);
      await service.init();
      try {
        const result = service.analyzeChurn(
          since ? new Date(since) : undefined,
          until ? new Date(until) : undefined
        );
        return {
          content: [
            {
              type: 'text',
              text: createTextContent({ status: 'ok', ...result }),
            },
          ],
        };
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
        maxDepth: z.number().int().min(1).max(20).optional().describe('Optional traversal depth limit'),
      },
    },
    async ({ nodeId, maxDepth }) => {
      const graph = await ensureGraphLoaded();
      if (!graph.projectRoot) {
        throw new Error('Project root is required to calculate blast radius v2');
      }

      const analyzer = new BlastRadiusV2(graph.projectRoot);
      await analyzer.init();
      try {
        const result = await analyzer.calculate(nodeId, maxDepth || 5);
        return {
          content: [
            {
              type: 'text',
              text: createTextContent({ status: 'ok', ...result }),
            },
          ],
        };
      } finally {
        await analyzer.close();
      }
    }
  );

  server.registerTool(
    'prepare_project_context',
    {
      title: 'Prepare Project Context',
      description:
        'Prepare a project-level mental model so an agent can understand architecture before editing or review',
      inputSchema: {
        projectPath: z
          .string()
          .optional()
          .describe(
            'Absolute project path. When provided, CodeMaps loads it before building the context.'
          ),
        includeClassifications: z
          .boolean()
          .optional()
          .describe('When true, include per-node layer classifications'),
        includeSecurityFindings: z
          .boolean()
          .optional()
          .describe('When true, include security findings in the project context'),
        limit: z
          .number()
          .int()
          .min(1)
          .max(50)
          .optional()
          .describe('Maximum number of patterns/dependencies/findings to include'),
      },
    },
    async ({
      projectPath,
      includeClassifications = false,
      includeSecurityFindings = false,
      limit = 10,
    }) => {
      const graph = await ensureGraphLoaded(projectPath);
      const context = await services.projectInsightService.prepareContext(graph, {
        includeClassifications,
        includeSecurityFindings,
        limit,
      });
      return {
        content: [
          {
            type: 'text',
            text: createTextContent({ status: 'ok', context }),
          },
        ],
      };
    }
  );

  server.registerTool(
    'prepare_task_context',
    {
      title: 'Prepare Task Context',
      description:
        'Route a natural-language user request into the right CodeMaps composite workflow with prepared context',
      inputSchema: {
        userRequest: z
          .string()
          .describe(
            'Natural-language user request, problem statement, bug report, feature ask or review prompt.'
          ),
        projectPath: z
          .string()
          .optional()
          .describe(
            'Absolute project path. When provided, CodeMaps loads it before building the context.'
          ),
        depth: z
          .number()
          .int()
          .min(1)
          .max(20)
          .optional()
          .describe('Optional blast radius depth limit when change-like context is selected'),
        includeClassifications: z
          .boolean()
          .optional()
          .describe('When true, include per-node layer classifications'),
        includeSecurityFindings: z
          .boolean()
          .optional()
          .describe('When true, include security findings in prepared contexts'),
        limit: z
          .number()
          .int()
          .min(1)
          .max(50)
          .optional()
          .describe('Maximum number of patterns/dependencies/findings to include'),
      },
    },
    async ({
      userRequest,
      projectPath,
      depth,
      includeClassifications = false,
      includeSecurityFindings = false,
      limit = 10,
    }) => {
      const graph = await ensureGraphLoaded(projectPath);
      const taskResult = await services.taskIntelligenceService.prepareContext(graph, {
        userRequest,
        depth,
        includeClassifications,
        includeSecurityFindings,
        limit,
      });
      return {
        content: [
          {
            type: 'text',
            text: createTextContent({ status: 'ok', taskResult }),
          },
        ],
      };
    }
  );

  server.registerTool(
    'prepare_change_campaign',
    {
      title: 'Prepare Change Campaign',
      description:
        'Prepare a phased multi-target migration/refactor context for broad codebase changes',
      inputSchema: {
        userRequest: z
          .string()
          .describe('Natural-language large-scale change request or migration plan.'),
        projectPath: z
          .string()
          .optional()
          .describe(
            'Absolute project path. When provided, CodeMaps loads it before building the context.'
          ),
        taskMode: z
          .enum(['bugfix', 'feature', 'refactor', 'explore'])
          .optional()
          .describe('High-level change mode for the campaign'),
        depth: z
          .number()
          .int()
          .min(1)
          .max(20)
          .optional()
          .describe('Dependency expansion depth for the campaign'),
        includeSecurityFindings: z
          .boolean()
          .optional()
          .describe('When true, include security findings related to the campaign area'),
        maxSeeds: z
          .number()
          .int()
          .min(1)
          .max(30)
          .optional()
          .describe('Maximum number of seed targets'),
        maxFiles: z
          .number()
          .int()
          .min(1)
          .max(100)
          .optional()
          .describe('Maximum number of affected files in the campaign'),
        seedNodeIds: z
          .array(z.string())
          .optional()
          .describe('Optional exact graph node ids to seed the campaign.'),
        candidateQueries: z
          .array(z.string())
          .optional()
          .describe('Optional pre-extracted candidate queries to bias campaign seed matching.'),
      },
    },
    async ({
      userRequest,
      projectPath,
      taskMode = 'refactor',
      depth,
      includeSecurityFindings = false,
      maxSeeds = 10,
      maxFiles = 50,
      seedNodeIds,
      candidateQueries,
    }) => {
      const graph = await ensureGraphLoaded(projectPath);
      const campaign = await services.changeCampaignService.prepareContext(graph, {
        userRequest,
        taskMode,
        depth,
        includeSecurityFindings,
        maxSeeds,
        maxFiles,
        seedNodeIds,
        candidateQueries: candidateQueries || [],
      });
      return {
        content: [
          {
            type: 'text',
            text: createTextContent({ status: 'ok', campaign }),
          },
        ],
      };
    }
  );

  server.registerTool(
    'prepare_change_context',
    {
      title: 'Prepare Change Context',
      description:
        'Prepare a high-level change context so an agent can edit code with architectural awareness',
      inputSchema: {
        target: z
          .string()
          .describe('Exact node id or free-text query for the code area that will be changed'),
        taskMode: z
          .enum(['bugfix', 'feature', 'refactor', 'explore'])
          .optional()
          .describe('High-level change mode used to tailor agent guidance'),
        changeIntent: z.string().optional().describe('Short human description of the planned change'),
        type: z
          .string()
          .optional()
          .describe('Optional node type filter such as file, class, function or adr'),
        projectPath: z
          .string()
          .optional()
          .describe(
            'Absolute project path. When provided, CodeMaps loads it before building the context.'
          ),
        depth: z
          .number()
          .int()
          .min(1)
          .max(20)
          .optional()
          .describe('Optional blast radius depth limit'),
        includeSecurityFindings: z
          .boolean()
          .optional()
          .describe('When true, include security findings related to the target area'),
      },
    },
    async ({
      target,
      taskMode,
      changeIntent,
      type,
      projectPath,
      depth,
      includeSecurityFindings = false,
    }) => {
      const graph = await ensureGraphLoaded(projectPath);
      const context = await services.agentContextService.prepareChangeContext(graph, {
        target,
        taskMode,
        changeIntent,
        type,
        depth,
        includeSecurityFindings,
      });
      return {
        content: [
          {
            type: 'text',
            text: createTextContent({ status: 'ok', context }),
          },
        ],
      };
    }
  );

  server.registerTool(
    'prepare_review_context',
    {
      title: 'Prepare Review Context',
      description:
        'Prepare a high-level review context so an agent can assess code quality, architecture and security',
      inputSchema: {
        taskMode: z
          .enum(['review', 'architecture', 'security', 'stabilization'])
          .optional()
          .describe('High-level review mode used to prioritize findings'),
        focusQuery: z
          .string()
          .optional()
          .describe('Optional free-text query to narrow the review to a specific directory or file'),
        projectPath: z
          .string()
          .optional()
          .describe(
            'Absolute project path. When provided, CodeMaps loads it before building the context.'
          ),
        includeClassifications: z
          .boolean()
          .optional()
          .describe('When true, include per-node layer classifications'),
        includeSecurityFindings: z
          .boolean()
          .optional()
          .describe('When true, include security findings (default true for review contexts)'),
        limit: z
          .number()
          .int()
          .min(1)
          .max(50)
          .optional()
          .describe('Maximum number of patterns/dependencies/findings to include'),
      },
    },
    async ({
      taskMode,
      focusQuery,
      projectPath,
      includeClassifications = false,
      includeSecurityFindings = true,
      limit = 10,
    }) => {
      const graph = await ensureGraphLoaded(projectPath);
      const context = await services.agentContextService.prepareReviewContext(graph, {
        taskMode,
        focusQuery,
        includeClassifications,
        includeSecurityFindings,
        limit,
      });
      return {
        content: [
          {
            type: 'text',
            text: createTextContent({ status: 'ok', context }),
          },
        ],
      };
    }
  );
}
