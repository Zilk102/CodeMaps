import cors from 'cors';
import express from 'express';
import * as http from 'http';
import * as path from 'path';
import { randomUUID } from 'node:crypto';
import { WebSocketServer, WebSocket } from 'ws';
import * as z from 'zod/v4';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { createMcpExpressApp } from '@modelcontextprotocol/sdk/server/express.js';
import { isInitializeRequest } from '@modelcontextprotocol/sdk/types.js';
import { oracle } from './oracle';
import { GraphData, GraphLink, GraphNode, oracleStore } from './store';
import { BlastRadiusAnalyzer } from './analysis/BlastRadiusAnalyzer';
import { HealthScoreAnalyzer } from './analysis/HealthScoreAnalyzer';
import { PatternDetectionAnalyzer } from './analysis/PatternDetectionAnalyzer';
import { SecurityScanner } from './analysis/SecurityScanner';
import { SignatureSearchService } from './analysis/SignatureSearchService';
import { ArchitectureInsightService } from './analysis/ArchitectureInsightService';
import { AgentContextService } from './analysis/AgentContextService';
import { ProjectInsightService } from './analysis/ProjectInsightService';
import { TaskIntelligenceService } from './analysis/TaskIntelligenceService';
import { ChangeCampaignService } from './analysis/ChangeCampaignService';

const MCP_HOST = '127.0.0.1';
const MCP_PORT = 3005;
const MCP_PATH = '/mcp';
const MCP_HTTP_URL = `http://${MCP_HOST}:${MCP_PORT}${MCP_PATH}`;
const MCP_WS_URL = `ws://localhost:${MCP_PORT}`;

type McpTransportRecord = {
  transport: StreamableHTTPServerTransport;
  server: McpServer;
};

export interface McpStatusToolDescriptor {
  name: string;
  title: string;
  description: string;
  preferredForAgents?: boolean;
  recommendedWhen?: string;
}

export interface McpStatusResourceDescriptor {
  uri: string;
  title: string;
  description: string;
  preferredForAgents?: boolean;
}

export interface McpStatus {
  enabled: boolean;
  host: string;
  port: number;
  path: string;
  endpoint: string;
  websocketUrl: string;
  resources: string[];
  tools: string[];
  resourceDetails: McpStatusResourceDescriptor[];
  toolDetails: McpStatusToolDescriptor[];
  projectRoot: string | null;
  nodesCount: number;
  linksCount: number;
}

type McpServiceHandle = {
  server: http.Server;
  getStatus: () => McpStatus;
};

let mcpService: McpServiceHandle | null = null;

const MCP_RESOURCES: McpStatusResourceDescriptor[] = [
  {
    uri: 'codemaps://project/summary',
    title: 'Project Summary',
    description: 'Brief summary of the project graph: root, node count, link count, and node types.',
  },
  {
    uri: 'codemaps://graph/full',
    title: 'Full Graph',
    description:
      'Full JSON graph of the project for advanced analysis, client integrations, and debugging.',
  },
  {
    uri: 'codemaps://agent/playbook',
    title: 'Agent Playbook',
    description:
      'How the agent should use CodeMaps automatically: preferred tools, fallback path, and execution order.',
    preferredForAgents: true,
  },
  {
    uri: 'codemaps://agent/project-brain',
    title: 'Project Brain',
    description:
      'Ready-to-use architectural mental model of the current project for an agent-first start without manual tool orchestration.',
    preferredForAgents: true,
  },
];

const MCP_TOOLS: McpStatusToolDescriptor[] = [
  {
    name: 'analyze_project',
    title: 'Analyze Project',
    description:
      'Indexes the project and loads the graph into CodeMaps. Usually, the agent should call this automatically when changing projects.',
    recommendedWhen: 'When the project is not open yet or you need to switch the active workspace.',
  },
  {
    name: 'get_graph_context',
    title: 'Get Graph Context',
    description:
      'Returns a graph summary or the full graph payload. Useful as a low-level fallback when the raw graph is needed.',
    recommendedWhen: 'When the composite context is insufficient and the agent needs a full snapshot of the graph.',
  },
  {
    name: 'get_node_dependencies',
    title: 'Get Node Dependencies',
    description:
      'Shows incoming and outgoing links of a specific node. Usually needed as a fallback after prepare_change_context.',
    recommendedWhen: 'When you need to manually expand the local dependency context.',
  },
  {
    name: 'search_graph',
    title: 'Search Graph',
    description:
      'Searches nodes by label or id, optionally filtered by type. Low-level search for ambiguous targets.',
    recommendedWhen: 'When target resolution in a composite context requires manual refinement.',
  },
  {
    name: 'get_blast_radius',
    title: 'Get Blast Radius',
    description:
      'Calculates the direct and transitive impact of changes for a selected node. Usually already included in prepare_change_context.',
    recommendedWhen: 'When you need to separately deepen the impact analysis for a specific node.',
  },
  {
    name: 'get_health_score',
    title: 'Get Health Score',
    description:
      'Evaluates graph health and architectural risks as a score/grade. Usually already included in prepare_review_context.',
    recommendedWhen: 'When you need to quickly re-verify overall degradation after a series of changes.',
  },
  {
    name: 'get_architecture_overview',
    title: 'Get Architecture Overview',
    description:
      'Classifies layers, shows cross-layer dependencies, and boundary violations. Usually already included in prepare_review_context.',
    recommendedWhen: 'When a detailed layer overview is needed outside of a composite review context.',
  },
  {
    name: 'detect_patterns',
    title: 'Detect Patterns',
    description:
      'Finds hotspots, fan-in/fan-out issues, and architectural anti-pattern candidates. Usually already included in prepare_review_context.',
    recommendedWhen: 'When a separate structural hotspot scan is needed.',
  },
  {
    name: 'run_security_scan',
    title: 'Run Security Scan',
    description:
      'Scans indexed files for risky and suspicious patterns. Usually already included in prepare_review_context or prepare_change_context.',
    recommendedWhen: 'When the review is focused on security or there are already findings near the target.',
  },
  {
    name: 'search_signatures',
    title: 'Search Signatures',
    description:
      'Searches declaration-like signatures across source code and symbols. Used as a fallback for precise declaration-level target search.',
    recommendedWhen: 'When you need to quickly find declaration-like code by name or regex.',
  },
  {
    name: 'prepare_task_context',
    title: 'Prepare Task Context',
    description:
      'Main agent-first tool for natural language user requests: determines intent, selects the right composite flow, and prepares change/review context if possible.',
    preferredForAgents: true,
    recommendedWhen:
      'Use first for standard human requests like "auth is broken", "find the cause", "add a feature", or "do a review".',
  },
  {
    name: 'prepare_change_campaign',
    title: 'Prepare Change Campaign',
    description:
      'Campaign-level tool for mass migrations and broad refactoring tasks: gathers seed targets, expanded scope, execution waves, and campaign risks.',
    preferredForAgents: true,
    recommendedWhen:
      'Use for tasks like "migrate all payment services to the new library", "replace SDK across the backend", or other multi-file campaigns.',
  },
  {
    name: 'prepare_project_context',
    title: 'Prepare Project Context',
    description:
      'Preferred starting tool for the agent: builds a project mental model, entry points, orchestrators, boundaries, and future work strategy.',
    preferredForAgents: true,
    recommendedWhen:
      'Use immediately after analyze_project when the agent needs to quickly understand any new project as a system.',
  },
  {
    name: 'prepare_change_context',
    title: 'Prepare Change Context',
    description:
      'Preferred tool for the agent before bugfix/feature/refactor: gathers target, dependencies, blast radius, architectural risks, and recommendations.',
    preferredForAgents: true,
    recommendedWhen: 'Use by default before any non-trivial code changes.',
  },
  {
    name: 'prepare_review_context',
    title: 'Prepare Review Context',
    description:
      'Preferred tool for the agent before review: gathers health, architecture, patterns, security, and check priorities.',
    preferredForAgents: true,
    recommendedWhen:
      'Use by default for reviews, architecture audits, and post-change validation.',
  },
];

const normalizePath = (value?: string) => value?.replace(/\\/g, '/');

const getGraphSnapshot = (): GraphData => {
  return oracle.getGraph();
};

const getGraphCountsByType = (graph: GraphData) => {
  return graph.nodes.reduce<Record<string, number>>((acc, node) => {
    acc[node.type] = (acc[node.type] || 0) + 1;
    return acc;
  }, {});
};

const createGraphSummary = (graph: GraphData) => ({
  projectRoot: graph.projectRoot,
  nodesCount: graph.nodes.length,
  linksCount: graph.links.length,
  nodeTypes: getGraphCountsByType(graph),
});

const ensureGraphLoaded = async (projectPath?: string): Promise<GraphData> => {
  const state = oracleStore.getState();
  const targetPath = normalizePath(projectPath) || state.baseDir || normalizePath(process.cwd())!;

  if (
    !state.baseDir ||
    (projectPath && normalizePath(state.baseDir) !== normalizePath(projectPath))
  ) {
    return oracle.analyzeProject(targetPath);
  }

  return oracle.getGraph();
};

const getNodeDependencies = (graph: GraphData, nodeId: string) => {
  const dependencies = graph.links.filter((link) => link.source === nodeId);
  const dependents = graph.links.filter((link) => link.target === nodeId);
  return { dependencies, dependents };
};

const searchGraph = (graph: GraphData, query: string, type?: string, limit = 20) => {
  const normalizedQuery = query.trim().toLowerCase();
  return graph.nodes
    .filter((node) => {
      if (type && node.type !== type) return false;
      if (!normalizedQuery) return true;
      return (
        node.label.toLowerCase().includes(normalizedQuery) ||
        node.id.toLowerCase().includes(normalizedQuery)
      );
    })
    .slice(0, limit);
};

const createTextContent = (payload: unknown) => JSON.stringify(payload, null, 2);

const createAgentPlaybook = () => ({
  version: 4,
  goal: 'A regular user connects CodeMaps to the agent, and the agent chooses the right tools automatically without needing MCP command knowledge.',
  preferredDefaultFlow: {
    openProject: 'analyze_project',
    naturalLanguageRequest: 'prepare_task_context',
    understandProject: 'prepare_project_context',
    largeScaleChange: 'prepare_change_campaign',
    codeChange: 'prepare_change_context',
    review: 'prepare_review_context',
  },
  rules: [
    'If the project is not open yet, call analyze_project first.',
    'If the user describes a problem, feature, degradation, or review in natural language, the agent should call prepare_task_context first.',
    'Immediately after opening a project, the agent should call prepare_project_context to build a mental model of entry points, orchestrators, and architectural boundaries.',
    'For mass migrations, library switches, and broad refactoring campaigns, use prepare_change_campaign instead of single-target prepare_change_context.',
    'For bugfix/feature/refactor, call prepare_change_context first.',
    'For review, architectural assessment, and post-change validation, call prepare_review_context first.',
    'Use low-level tools only as a fallback when the composite context is insufficient.',
  ],
  fallbackTools: [
    'search_graph',
    'get_node_dependencies',
    'get_blast_radius',
    'get_architecture_overview',
    'get_health_score',
    'detect_patterns',
    'run_security_scan',
    'search_signatures',
  ],
});

const createMcpServer = () => {
  const server = new McpServer(
    {
      name: 'codemaps-mcp',
      version: '1.0.0',
      websiteUrl: 'https://localhost/codemaps',
    },
    {
      capabilities: {
        logging: {},
      },
    }
  );
  const blastRadiusAnalyzer = new BlastRadiusAnalyzer();
  const healthScoreAnalyzer = new HealthScoreAnalyzer();
  const patternDetectionAnalyzer = new PatternDetectionAnalyzer();
  const securityScanner = new SecurityScanner();
  const signatureSearchService = new SignatureSearchService();
  const architectureInsightService = new ArchitectureInsightService();
  const agentContextService = new AgentContextService();
  const projectInsightService = new ProjectInsightService();
  const taskIntelligenceService = new TaskIntelligenceService(
    projectInsightService,
    agentContextService
  );
  const changeCampaignService = new ChangeCampaignService();

  server.registerResource(
    'project-summary',
    'codemaps://project/summary',
    {
      title: 'Project Summary',
      description: 'High-level graph summary for the currently opened project',
      mimeType: 'application/json',
    },
    async () => {
      const graph = await ensureGraphLoaded();
      const summary = createGraphSummary(graph);
      return {
        contents: [
          {
            uri: 'codemaps://project/summary',
            mimeType: 'application/json',
            text: createTextContent(summary),
          },
        ],
      };
    }
  );

  server.registerResource(
    'graph-full',
    'codemaps://graph/full',
    {
      title: 'Full Graph',
      description: 'Complete CodeMaps graph for the currently opened project',
      mimeType: 'application/json',
    },
    async () => {
      const graph = await ensureGraphLoaded();
      return {
        contents: [
          {
            uri: 'codemaps://graph/full',
            mimeType: 'application/json',
            text: createTextContent(graph),
          },
        ],
      };
    }
  );

  server.registerResource(
    'agent-playbook',
    'codemaps://agent/playbook',
    {
      title: 'Agent Playbook',
      description: 'Preferred agent-first workflow for CodeMaps',
      mimeType: 'application/json',
    },
    async () => {
      return {
        contents: [
          {
            uri: 'codemaps://agent/playbook',
            mimeType: 'application/json',
            text: createTextContent(createAgentPlaybook()),
          },
        ],
      };
    }
  );

  server.registerResource(
    'project-brain',
    'codemaps://agent/project-brain',
    {
      title: 'Project Brain',
      description: 'Project-level architectural mental model for agent-first understanding',
      mimeType: 'application/json',
    },
    async () => {
      const graph = await ensureGraphLoaded();
      const context = await projectInsightService.prepareContext(graph, {
        includeSecurityFindings: true,
        includeClassifications: false,
        limit: 8,
      });
      return {
        contents: [
          {
            uri: 'codemaps://agent/project-brain',
            mimeType: 'application/json',
            text: createTextContent(context),
          },
        ],
      };
    }
  );

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

      // Save to recent projects when analyzed via MCP
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

      const blastRadius = blastRadiusAnalyzer.analyze(graph, nodeId, depth);
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
      const health = healthScoreAnalyzer.analyze(graph);
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
      const overview = architectureInsightService.analyze(graph);
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
      const result = patternDetectionAnalyzer.analyze(graph);
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
      const scan = await securityScanner.analyze(graph);
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
      const result = await signatureSearchService.search(graph, query, {
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
        limit: z
          .number()
          .int()
          .min(1)
          .max(50)
          .optional()
          .describe('Maximum number of patterns/dependencies/findings to include'),
        includeSecurityFindings: z
          .boolean()
          .optional()
          .describe('When true, include security findings in the project context'),
        includeClassifications: z
          .boolean()
          .optional()
          .describe('When true, include per-node layer classifications'),
      },
    },
    async ({
      projectPath,
      limit = 10,
      includeSecurityFindings = true,
      includeClassifications = false,
    }) => {
      try {
        const graph = await ensureGraphLoaded(projectPath);
        const context = await projectInsightService.prepareContext(graph, {
          limit,
          includeSecurityFindings,
          includeClassifications,
        });
        return {
          content: [
            {
              type: 'text',
              text: createTextContent({
                status: 'ok',
                context,
              }),
            },
          ],
        };
      } catch (error: any) {
        return {
          content: [
            {
              type: 'text',
              text: createTextContent({
                status: 'error',
                message: error?.message || 'Failed to prepare project context',
              }),
            },
          ],
          isError: true,
        };
      }
    }
  );

  server.registerTool(
    'prepare_task_context',
    {
      title: 'Prepare Task Context',
      description:
        'Route a natural-language user request into the right CodeMaps composite workflow with prepared context',
      inputSchema: {
        projectPath: z
          .string()
          .optional()
          .describe(
            'Absolute project path. When provided, CodeMaps loads it before building the context.'
          ),
        userRequest: z
          .string()
          .describe(
            'Natural-language user request, problem statement, bug report, feature ask or review prompt.'
          ),
        limit: z
          .number()
          .int()
          .min(1)
          .max(50)
          .optional()
          .describe('Maximum number of patterns/dependencies/findings to include'),
        depth: z
          .number()
          .int()
          .min(1)
          .max(20)
          .optional()
          .describe('Optional blast radius depth limit when change-like context is selected'),
        includeSecurityFindings: z
          .boolean()
          .optional()
          .describe('When true, include security findings in prepared contexts'),
        includeClassifications: z
          .boolean()
          .optional()
          .describe('When true, include per-node layer classifications'),
      },
    },
    async ({
      projectPath,
      userRequest,
      limit = 10,
      depth = 4,
      includeSecurityFindings = true,
      includeClassifications = false,
    }) => {
      try {
        const graph = await ensureGraphLoaded(projectPath);
        const context = await taskIntelligenceService.prepareContext(graph, {
          userRequest,
          limit,
          depth,
          includeSecurityFindings,
          includeClassifications,
        });
        return {
          content: [
            {
              type: 'text',
              text: createTextContent({
                status: 'ok',
                context,
              }),
            },
          ],
        };
      } catch (error: any) {
        return {
          content: [
            {
              type: 'text',
              text: createTextContent({
                status: 'error',
                message: error?.message || 'Failed to prepare task context',
              }),
            },
          ],
          isError: true,
        };
      }
    }
  );

  server.registerTool(
    'prepare_change_campaign',
    {
      title: 'Prepare Change Campaign',
      description:
        'Prepare a phased multi-target migration/refactor context for broad codebase changes',
      inputSchema: {
        projectPath: z
          .string()
          .optional()
          .describe(
            'Absolute project path. When provided, CodeMaps loads it before building the context.'
          ),
        userRequest: z
          .string()
          .describe('Natural-language large-scale change request or migration plan.'),
        candidateQueries: z
          .array(z.string())
          .optional()
          .describe('Optional pre-extracted candidate queries to bias campaign seed matching.'),
        seedNodeIds: z
          .array(z.string())
          .optional()
          .describe('Optional exact graph node ids to seed the campaign.'),
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
        includeSecurityFindings: z
          .boolean()
          .optional()
          .describe('When true, include security findings related to the campaign area'),
      },
    },
    async ({
      projectPath,
      userRequest,
      candidateQueries = [],
      seedNodeIds = [],
      taskMode,
      depth = 2,
      maxSeeds = 8,
      maxFiles = 30,
      includeSecurityFindings = true,
    }) => {
      try {
        const graph = await ensureGraphLoaded(projectPath);
        const context = await changeCampaignService.prepareContext(graph, {
          userRequest,
          candidateQueries,
          seedNodeIds,
          taskMode,
          depth,
          maxSeeds,
          maxFiles,
          includeSecurityFindings,
        });
        return {
          content: [
            {
              type: 'text',
              text: createTextContent({
                status: 'ok',
                context,
              }),
            },
          ],
        };
      } catch (error: any) {
        return {
          content: [
            {
              type: 'text',
              text: createTextContent({
                status: 'error',
                message: error?.message || 'Failed to prepare change campaign',
              }),
            },
          ],
          isError: true,
        };
      }
    }
  );

  server.registerTool(
    'prepare_change_context',
    {
      title: 'Prepare Change Context',
      description:
        'Prepare a high-level change context so an agent can edit code with architectural awareness',
      inputSchema: {
        projectPath: z
          .string()
          .optional()
          .describe(
            'Absolute project path. When provided, CodeMaps loads it before building the context.'
          ),
        target: z
          .string()
          .describe('Exact node id or free-text query for the code area that will be changed'),
        type: z
          .string()
          .optional()
          .describe('Optional node type filter such as file, class, function or adr'),
        taskMode: z
          .enum(['bugfix', 'feature', 'refactor', 'explore'])
          .optional()
          .describe('High-level change mode used to tailor agent guidance'),
        changeIntent: z
          .string()
          .optional()
          .describe('Short human description of the planned change'),
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
      projectPath,
      target,
      type,
      taskMode,
      changeIntent,
      depth,
      includeSecurityFindings = true,
    }) => {
      try {
        const graph = await ensureGraphLoaded(projectPath);
        const context = await agentContextService.prepareChangeContext(graph, {
          target,
          type,
          taskMode,
          changeIntent,
          depth,
          includeSecurityFindings,
        });
        return {
          content: [
            {
              type: 'text',
              text: createTextContent({
                status: 'ok',
                context,
              }),
            },
          ],
        };
      } catch (error: any) {
        return {
          content: [
            {
              type: 'text',
              text: createTextContent({
                status: 'error',
                message: error?.message || 'Failed to prepare change context',
              }),
            },
          ],
          isError: true,
        };
      }
    }
  );

  server.registerTool(
    'prepare_review_context',
    {
      title: 'Prepare Review Context',
      description:
        'Prepare a high-level review context so an agent can assess architecture without hand-orchestrating all tools',
      inputSchema: {
        projectPath: z
          .string()
          .optional()
          .describe(
            'Absolute project path. When provided, CodeMaps loads it before building the context.'
          ),
        focusQuery: z
          .string()
          .optional()
          .describe('Optional file/symbol query to focus the review on a sub-area'),
        type: z.string().optional().describe('Optional node type filter for the focus query'),
        taskMode: z
          .enum(['review', 'architecture', 'security', 'stabilization'])
          .optional()
          .describe('High-level review mode used to tailor agent guidance'),
        limit: z
          .number()
          .int()
          .min(1)
          .max(50)
          .optional()
          .describe('Maximum number of patterns/dependencies/violations to return'),
        includeSecurityFindings: z
          .boolean()
          .optional()
          .describe('When true, include security findings in the review context'),
        includeClassifications: z
          .boolean()
          .optional()
          .describe('When true, include per-node layer classifications'),
      },
    },
    async ({
      projectPath,
      focusQuery,
      type,
      taskMode,
      limit = 12,
      includeSecurityFindings = true,
      includeClassifications = false,
    }) => {
      try {
        const graph = await ensureGraphLoaded(projectPath);
        const context = await agentContextService.prepareReviewContext(graph, {
          focusQuery,
          type,
          taskMode,
          limit,
          includeSecurityFindings,
          includeClassifications,
        });
        return {
          content: [
            {
              type: 'text',
              text: createTextContent({
                status: 'ok',
                context,
              }),
            },
          ],
        };
      } catch (error: any) {
        return {
          content: [
            {
              type: 'text',
              text: createTextContent({
                status: 'error',
                message: error?.message || 'Failed to prepare review context',
              }),
            },
          ],
          isError: true,
        };
      }
    }
  );

  return server;
};

const getMcpStatusInternal = (): McpStatus => {
  const graph = getGraphSnapshot();
  return {
    enabled: true,
    host: MCP_HOST,
    port: MCP_PORT,
    path: MCP_PATH,
    endpoint: MCP_HTTP_URL,
    websocketUrl: MCP_WS_URL,
    resources: MCP_RESOURCES.map((resource) => resource.uri),
    tools: MCP_TOOLS.map((tool) => tool.name),
    resourceDetails: MCP_RESOURCES,
    toolDetails: MCP_TOOLS,
    projectRoot: graph.projectRoot || null,
    nodesCount: graph.nodes.length,
    linksCount: graph.links.length,
  };
};

export const getMcpStatus = (): McpStatus => {
  return mcpService?.getStatus() || getMcpStatusInternal();
};

export function setupMcpServer() {
  if (mcpService) {
    return mcpService;
  }

  const app = createMcpExpressApp({ host: MCP_HOST });
  app.use(cors());
  app.use(express.json({ limit: '10mb' }));

  app.get('/mcp/status', (_req, res) => {
    res.json({ status: 'ok', ...getMcpStatusInternal() });
  });

  // Legacy compatibility endpoints
  app.get('/mcp/context', async (_req, res) => {
    try {
      const graph = await ensureGraphLoaded();
      res.json({
        status: 'ok',
        projectRoot: graph.projectRoot,
        context: graph,
        metadata: {
          nodesCount: graph.nodes.length,
          linksCount: graph.links.length,
        },
      });
    } catch (error: any) {
      res.status(500).json({ status: 'error', message: error.message });
    }
  });

  app.get('/mcp/dependencies', async (req, res) => {
    const targetId = req.query.id as string;
    if (!targetId) {
      return res
        .status(400)
        .json({ status: 'error', message: 'Missing target id query parameter' });
    }

    const graph = await ensureGraphLoaded();
    return res.json({
      status: 'ok',
      target: targetId,
      ...getNodeDependencies(graph, targetId),
    });
  });

  const server = http.createServer(app);
  const wss = new WebSocketServer({ server });
  const clients = new Set<WebSocket>();
  const transports: Record<string, McpTransportRecord> = {};

  wss.on('connection', (ws) => {
    clients.add(ws);

    const state = oracleStore.getState();
    if (state.baseDir) {
      ws.send(
        JSON.stringify({
          type: 'graph-updated',
          payload: oracle.getGraph(),
        })
      );
    }

    ws.on('close', () => {
      clients.delete(ws);
    });
  });

  const handleMcpPost = async (req: express.Request, res: express.Response) => {
    const sessionId = req.headers['mcp-session-id'];

    try {
      let record: McpTransportRecord | undefined;

      if (typeof sessionId === 'string' && transports[sessionId]) {
        record = transports[sessionId];
      } else if (!sessionId && isInitializeRequest(req.body)) {
        const transport = new StreamableHTTPServerTransport({
          sessionIdGenerator: () => randomUUID(),
          onsessioninitialized: (initializedSessionId) => {
            transports[initializedSessionId] = {
              transport,
              server: record!.server,
            };
          },
        });

        transport.onclose = () => {
          const currentSessionId = transport.sessionId;
          if (currentSessionId) {
            delete transports[currentSessionId];
          }
        };

        record = {
          transport,
          server: createMcpServer(),
        };

        await record.server.connect(transport);
        await transport.handleRequest(req, res, req.body);
        return;
      } else {
        res.status(400).json({
          jsonrpc: '2.0',
          error: {
            code: -32000,
            message: 'Bad Request: No valid MCP session id provided',
          },
          id: null,
        });
        return;
      }

      await record.transport.handleRequest(req, res, req.body);
    } catch (error) {
      console.error('Error handling MCP POST request:', error);
      if (!res.headersSent) {
        res.status(500).json({
          jsonrpc: '2.0',
          error: {
            code: -32603,
            message: 'Internal server error',
          },
          id: null,
        });
      }
    }
  };

  const handleMcpGet = async (req: express.Request, res: express.Response) => {
    const sessionId = req.headers['mcp-session-id'];
    if (typeof sessionId !== 'string' || !transports[sessionId]) {
      res.status(400).send('Invalid or missing session ID');
      return;
    }

    await transports[sessionId].transport.handleRequest(req, res);
  };

  const handleMcpDelete = async (req: express.Request, res: express.Response) => {
    const sessionId = req.headers['mcp-session-id'];
    if (typeof sessionId !== 'string' || !transports[sessionId]) {
      res.status(400).send('Invalid or missing session ID');
      return;
    }

    await transports[sessionId].transport.handleRequest(req, res);
  };

  app.post(MCP_PATH, handleMcpPost);
  app.get(MCP_PATH, handleMcpGet);
  app.delete(MCP_PATH, handleMcpDelete);

  oracle.on('graph-updated', (graphData) => {
    const diff = oracleStore.getState().getAndResetDiff();
    const message = JSON.stringify({
      type: 'graph-diff',
      payload: {
        graph: graphData,
        diff,
      },
    });

    for (const client of clients) {
      if (client.readyState === WebSocket.OPEN) {
        client.send(message);
      }
    }
  });

  oracle.on('parsing-progress', (progress) => {
    const message = JSON.stringify({
      type: 'parsing-progress',
      payload: progress,
    });

    for (const client of clients) {
      if (client.readyState === WebSocket.OPEN) {
        client.send(message);
      }
    }
  });

  server.listen(MCP_PORT, MCP_HOST, () => {
    console.log(`[MCP] Streamable HTTP endpoint: ${MCP_HTTP_URL}`);
    console.log(`[WS] Graph updates endpoint: ${MCP_WS_URL}`);
  });

  mcpService = {
    server,
    getStatus: getMcpStatusInternal,
  };

  return mcpService;
}
