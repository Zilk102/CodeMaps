import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import * as z from 'zod/v4';
import { defineGraphTool } from './defineTool';
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
  registerProjectContext(server, context);
  registerTaskContext(server, context);
  registerChangeCampaign(server, context);
  registerChangeContext(server, context);
  registerReviewContext(server, context);
}

/** The inputs every context tool that can include classifications and security findings shares. */
const contextSwitches = (securityDescription: string) => ({
  includeClassifications: includeClassificationsField,
  includeSecurityFindings: optionalBoolean(securityDescription),
  limit: contextLimitField(PATTERN_LIMIT_DESCRIPTION),
});

function registerProjectContext(server: McpServer, context: McpToolContext) {
  const switches = contextSwitches('When true, include security findings in the project context');
  defineGraphTool(
    server,
    {
      name: 'prepare_project_context',
      title: 'Prepare Project Context',
      description:
        'Prepare a project-level mental model so an agent can understand architecture before editing or review',
      inputSchema: { projectPath: projectPathField, ...switches },
    },
    async (
      graph,
      { includeClassifications = false, includeSecurityFindings = false, limit = 10 }
    ) => {
      const preparedContext = await context.projectInsightService.prepareContext(graph, {
        includeClassifications,
        includeSecurityFindings,
        limit,
      });
      return okCompactStatusToolResult({ context: preparedContext }, limit);
    }
  );
}

function registerTaskContext(server: McpServer, context: McpToolContext) {
  const switches = contextSwitches('When true, include security findings in prepared contexts');
  defineGraphTool(
    server,
    {
      name: 'prepare_task_context',
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
        ...switches,
      },
    },
    async (
      graph,
      {
        userRequest,
        depth,
        includeClassifications = false,
        includeSecurityFindings = false,
        limit = 10,
      }
    ) => {
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
}

const changeCampaignInputSchema = {
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
};

function registerChangeCampaign(server: McpServer, context: McpToolContext) {
  defineGraphTool(
    server,
    {
      name: 'prepare_change_campaign',
      title: 'Prepare Change Campaign',
      description:
        'Prepare a phased multi-target migration/refactor context for broad codebase changes',
      inputSchema: changeCampaignInputSchema,
    },
    async (
      graph,
      {
        userRequest,
        taskMode = 'refactor',
        depth,
        includeSecurityFindings = false,
        maxSeeds = 10,
        maxFiles = 50,
        seedNodeIds,
        candidateQueries,
      }
    ) => {
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
}

function registerChangeContext(server: McpServer, context: McpToolContext) {
  defineGraphTool(
    server,
    {
      name: 'prepare_change_context',
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
    async (
      graph,
      { target, taskMode, changeIntent, type, depth, includeSecurityFindings = false, limit = 15 }
    ) => {
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
}

function registerReviewContext(server: McpServer, context: McpToolContext) {
  const switches = contextSwitches(
    'When true, include security findings (default true for review contexts)'
  );
  defineGraphTool(
    server,
    {
      name: 'prepare_review_context',
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
        ...switches,
      },
    },
    async (
      graph,
      {
        taskMode,
        focusQuery,
        includeClassifications = false,
        includeSecurityFindings = true,
        limit = 10,
      }
    ) => {
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
