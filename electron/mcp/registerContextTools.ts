/** Registers the composite `prepare_*` tools, each of which assembles one bounded context for an agent. */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import * as z from 'zod/v4';
import { GraphData } from '../store';
import { defineGraphTool, type ToolArgs, type ToolSpec } from './defineTool';
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

/** Registers the project, task, change campaign, change and review context tools on `server`. */
export function registerContextTools(server: McpServer, context: McpToolContext) {
  registerProjectContext(server, context);
  registerTaskContext(server, context);
  registerChangeCampaign(server, context);
  registerChangeContext(server, context);
  registerReviewContext(server, context);
}

interface PreparedContext {
  result: unknown;
  /** How many items per list the compact status result keeps. */
  limit: number;
}

/** A graph tool that prepares one context and returns it under `resultKey`. */
function defineContextTool<Shape extends z.ZodRawShape>(
  server: McpServer,
  spec: ToolSpec<Shape>,
  resultKey: string,
  prepare: (graph: GraphData, args: ToolArgs<Shape>) => Promise<PreparedContext>
) {
  defineGraphTool(server, spec, async (graph, args) => {
    const { result, limit } = await prepare(graph, args);
    return okCompactStatusToolResult({ [resultKey]: result }, limit);
  });
}

interface SwitchArgs {
  includeClassifications?: boolean;
  includeSecurityFindings?: boolean;
  limit?: number;
}

/** The options of the switches above, with the defaults the context tools share. */
const switchOptions = (args: SwitchArgs, includeSecurityFindings: boolean) => ({
  includeClassifications: args.includeClassifications ?? false,
  includeSecurityFindings: args.includeSecurityFindings ?? includeSecurityFindings,
  limit: args.limit ?? 10,
});

/** Runs a context service with the tool's options and reports the limit those options set. */
const prepareWith = async <O extends { limit: number }>(
  options: O,
  run: (options: O) => Promise<unknown>
): Promise<PreparedContext> => ({ result: await run(options), limit: options.limit });

/** The inputs every context tool that can include classifications and security findings shares. */
const contextSwitches = (securityDescription: string) => ({
  includeClassifications: includeClassificationsField,
  includeSecurityFindings: optionalBoolean(securityDescription),
  limit: contextLimitField(PATTERN_LIMIT_DESCRIPTION),
});

/** Registers `prepare_project_context`; security findings are off unless requested. */
function registerProjectContext(server: McpServer, context: McpToolContext) {
  const switches = contextSwitches('When true, include security findings in the project context');
  defineContextTool(
    server,
    {
      name: 'prepare_project_context',
      title: 'Prepare Project Context',
      description:
        'Prepare a project-level mental model so an agent can understand architecture before editing or review',
      inputSchema: { projectPath: projectPathField, ...switches },
    },
    'context',
    (graph, args) =>
      prepareWith(switchOptions(args, false), (options) =>
        context.projectInsightService.prepareContext(graph, options)
      )
  );
}

/** Registers `prepare_task_context`, which routes a natural-language request to the matching composite workflow. */
function registerTaskContext(server: McpServer, context: McpToolContext) {
  const switches = contextSwitches('When true, include security findings in prepared contexts');
  defineContextTool(
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
    'taskResult',
    (graph, { userRequest, depth, ...switches }) =>
      prepareWith({ userRequest, depth, ...switchOptions(switches, false) }, (options) =>
        context.taskIntelligenceService.prepareContext(graph, options)
      )
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

/** Registers `prepare_change_campaign`; the response is capped at the larger of `maxFiles` and `maxSeeds` items per list. */
function registerChangeCampaign(server: McpServer, context: McpToolContext) {
  defineContextTool(
    server,
    {
      name: 'prepare_change_campaign',
      title: 'Prepare Change Campaign',
      description:
        'Prepare a phased multi-target migration/refactor context for broad codebase changes',
      inputSchema: changeCampaignInputSchema,
    },
    'campaign',
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
    ) => ({
      result: await context.changeCampaignService.prepareContext(graph, {
        userRequest,
        taskMode,
        depth,
        includeSecurityFindings,
        maxSeeds,
        maxFiles,
        seedNodeIds,
        candidateQueries: candidateQueries || [],
      }),
      limit: Math.max(maxFiles, maxSeeds),
    })
  );
}

/** Registers `prepare_change_context` for one target node or query. */
function registerChangeContext(server: McpServer, context: McpToolContext) {
  defineContextTool(
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
    'changeContext',
    async (
      graph,
      { target, taskMode, changeIntent, type, depth, includeSecurityFindings = false, limit = 15 }
    ) => ({
      result: await context.changeContextService.prepareChangeContext(graph, {
        target,
        taskMode,
        changeIntent,
        type,
        depth,
        includeSecurityFindings,
      }),
      limit,
    })
  );
}

/** Registers `prepare_review_context`; security findings are on by default here, unlike the other context tools. */
function registerReviewContext(server: McpServer, context: McpToolContext) {
  const switches = contextSwitches(
    'When true, include security findings (default true for review contexts)'
  );
  defineContextTool(
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
    'reviewContext',
    (graph, { taskMode, focusQuery, ...switches }) =>
      prepareWith({ taskMode, focusQuery, ...switchOptions(switches, true) }, (options) =>
        context.reviewContextService.prepareReviewContext(graph, options)
      )
  );
}
