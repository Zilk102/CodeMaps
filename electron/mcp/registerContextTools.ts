import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import * as z from 'zod/v4';
import { ChangeTaskMode } from '../analysis/ChangeContextService';
import { ensureGraphLoaded } from './utils';
import { McpToolContext } from './toolContext';
import {
  PATTERN_LIMIT_DESCRIPTION,
  boundedInt,
  changeTaskModeField,
  contextLimitField,
  includeClassificationsField,
  optionalBoolean,
  optionalString,
  projectPathField,
} from './toolSchemas';
import { okCompactStatusToolResult } from './toolSupport';

export function registerContextTools(server: McpServer, context: McpToolContext) {
  server.registerTool(
    'prepare_project_context',
    {
      title: 'Prepare Project Context',
      description:
        'Prepare a project-level mental model so an agent can understand architecture before editing or review',
      inputSchema: {
        projectPath: projectPathField,
        includeClassifications: includeClassificationsField,
        includeSecurityFindings: optionalBoolean(
          'When true, include security findings in the project context'
        ),
        limit: contextLimitField(PATTERN_LIMIT_DESCRIPTION),
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
      return okCompactStatusToolResult({ context: preparedContext }, limit);
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
        projectPath: projectPathField,
        depth: boundedInt(
          20,
          'Optional blast radius depth limit when change-like context is selected'
        ),
        includeClassifications: includeClassificationsField,
        includeSecurityFindings: optionalBoolean(
          'When true, include security findings in prepared contexts'
        ),
        limit: contextLimitField(PATTERN_LIMIT_DESCRIPTION),
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
      return okCompactStatusToolResult({ taskResult }, limit);
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
        projectPath: projectPathField,
        taskMode: changeTaskModeField('High-level change mode for the campaign'),
        depth: boundedInt(20, 'Dependency expansion depth for the campaign'),
        includeSecurityFindings: optionalBoolean(
          'When true, include security findings related to the campaign area'
        ),
        maxSeeds: boundedInt(30, 'Maximum number of seed targets'),
        maxFiles: boundedInt(100, 'Maximum number of affected files in the campaign'),
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
      return okCompactStatusToolResult({ campaign }, Math.max(maxFiles, maxSeeds));
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
        taskMode: changeTaskModeField('High-level change mode used to tailor agent guidance'),
        changeIntent: optionalString('Short human description of the planned change'),
        type: optionalString('Optional node type filter such as file, class, function or adr'),
        projectPath: projectPathField,
        depth: boundedInt(20, 'Optional blast radius depth limit'),
        includeSecurityFindings: optionalBoolean(
          'When true, include security findings related to the target area'
        ),
        limit: contextLimitField(
          'Maximum number of items kept in each list of the returned context'
        ),
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
      limit = 15,
    }: {
      target: string;
      taskMode?: ChangeTaskMode;
      changeIntent?: string;
      type?: string;
      projectPath?: string;
      depth?: number;
      includeSecurityFindings?: boolean;
      limit?: number;
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
      return okCompactStatusToolResult({ changeContext: preparedContext }, limit);
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
        focusQuery: optionalString(
          'Optional free-text query to narrow the review to a specific directory or file'
        ),
        projectPath: projectPathField,
        includeClassifications: includeClassificationsField,
        includeSecurityFindings: optionalBoolean(
          'When true, include security findings (default true for review contexts)'
        ),
        limit: contextLimitField(PATTERN_LIMIT_DESCRIPTION),
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
      return okCompactStatusToolResult({ reviewContext: preparedContext }, limit);
    }
  );
}
