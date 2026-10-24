import * as z from 'zod/v4';

/**
 * Shared input-schema fragments for MCP tools. The text of every description is part of the
 * public tool contract, so change it only deliberately.
 */

/** Optional integer between 1 and `max`. */
export const boundedInt = (max: number, description: string) =>
  z.number().int().min(1).max(max).optional().describe(description);

/** Optional string input field with the given description. */
export const optionalString = (description: string) => z.string().optional().describe(description);

/** Optional boolean input field with the given description. */
export const optionalBoolean = (description: string) =>
  z.boolean().optional().describe(description);

export const projectPathField = optionalString(
  'Absolute project path. When provided, CodeMaps loads it before building the context.'
);

export const includeClassificationsField = optionalBoolean(
  'When true, include per-node layer classifications'
);

export const nodeIdField = z.string().describe('Exact node id from the graph');

/** Optional input field restricted to the change task modes `bugfix`, `feature`, `refactor` and `explore`. */
export const changeTaskModeField = (description: string) =>
  z.enum(['bugfix', 'feature', 'refactor', 'explore']).optional().describe(description);

/** The `limit` used by the prepare_* tools. */
export const contextLimitField = (description: string) => boundedInt(50, description);

export const PATTERN_LIMIT_DESCRIPTION =
  'Maximum number of patterns/dependencies/findings to include';
