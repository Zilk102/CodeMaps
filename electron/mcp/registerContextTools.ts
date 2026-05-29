import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import * as z from 'zod/v4';
import { ChangeTaskMode } from '../analysis/ChangeContextService';
import { ensureGraphLoaded } from './utils';
import { McpToolContext } from './toolContext';
import { okStatusToolResult } from './toolSupport';

export function registerContextTools(server: McpServer, context: McpToolContext) {
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
    }: {
      projectPath?: string;
      includeClassifications?: boolean;
      includeSecurityFindings?: boolean;
      limit?: number;
    }) => {
      const graph = await ensureGraphLoaded(projectPath);
      const preparedContext = await context.projectInsightService.prepareContext(graph, {
        includeClassifications,
        includeSecurityFindings,
        limit,
      });
      return okStatusToolResult({ context: preparedContext });
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
    }: {
      userRequest: string;
      projectPath?: string;
      depth?: number;
      includeClassifications?: boolean;
      includeSecurityFindings?: boolean;
      limit?: number;
    }) => {
      const graph = await ensureGraphLoaded(projectPath);
      const taskResult = await context.taskIntelligenceService.prepareContext(graph, {
        userRequest,
        depth,
        includeClassifications,
        includeSecurityFindings,
        limit,
      });
      return okStatusToolResult({ taskResult });
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
    }: {
      userRequest: string;
      projectPath?: string;
      taskMode?: ChangeTaskMode;
      depth?: number;
      includeSecurityFindings?: boolean;
      maxSeeds?: number;
      maxFiles?: number;
      seedNodeIds?: string[];
      candidateQueries?: string[];
    }) => {
      const graph = await ensureGraphLoaded(projectPath);
      const campaign = await context.changeCampaignService.prepareContext(graph, {
        userRequest,
        taskMode,
        depth,
        includeSecurityFindings,
        maxSeeds,
        maxFiles,
        seedNodeIds,
        candidateQueries: candidateQueries || [],
      });
      return okStatusToolResult({ campaign });
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
    }: {
      target: string;
      taskMode?: ChangeTaskMode;
      changeIntent?: string;
      type?: string;
      projectPath?: string;
      depth?: number;
      includeSecurityFindings?: boolean;
    }) => {
      const graph = await ensureGraphLoaded(projectPath);
      const preparedContext = await context.changeContextService.prepareChangeContext(graph, {
        target,
        taskMode,
        changeIntent,
        type,
        depth,
        includeSecurityFindings,
      });
      return okStatusToolResult({ context: preparedContext });
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
    }: {
      taskMode?: 'review' | 'architecture' | 'security' | 'stabilization';
      focusQuery?: string;
      projectPath?: string;
      includeClassifications?: boolean;
      includeSecurityFindings?: boolean;
      limit?: number;
    }) => {
      const graph = await ensureGraphLoaded(projectPath);
      const preparedContext = await context.reviewContextService.prepareReviewContext(graph, {
        taskMode,
        focusQuery,
        includeClassifications,
        includeSecurityFindings,
        limit,
      });
      return okStatusToolResult({ context: preparedContext });
    }
  );
}
