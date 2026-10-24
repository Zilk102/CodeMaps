/** Registers the `find_duplicates` tool on top of the shared clone index. */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import * as z from 'zod/v4';
import { cloneIndex } from '../analysis/clones/CloneIndex';
import { buildDuplicateReport } from '../analysis/clones/duplicateReport';
import { defineGraphTool } from './defineTool';
import { boundedInt, optionalBoolean, optionalString } from './toolSchemas';
import { okStatusToolResult } from './toolSupport';
import { resolveProjectFilePath } from './utils';

const DEFAULT_MIN_LINES = 6;

/** Registers `find_duplicates`: refreshes the clone index for the loaded project and returns up to `limit` duplicate groups of at least `minLines` lines, optionally only those touching `filePath`. */
export function registerDuplicateTools(server: McpServer) {
  defineGraphTool(
    server,
    {
      name: 'find_duplicates',
      title: 'Find Duplicates',
      description:
        'Find copy-pasted code and say how to remove it: every group lists the copies (file and line range), how many values differ between them (the parameters of the function to extract), sample differences, and a suggestion with the action and a target file.',
      inputSchema: {
        limit: boundedInt(50, 'Maximum number of duplicate groups to return (default 10)'),
        minLines: z
          .number()
          .int()
          .min(1)
          .max(1000)
          .optional()
          .describe('Ignore groups shorter than this many lines (default 6)'),
        includeTests: optionalBoolean('When true, also search test files (default false)'),
        filePath: optionalString(
          'Only groups with a copy in this file (absolute, or relative to the project root)'
        ),
      },
    },
    async (graph, { limit = 10, minLines = DEFAULT_MIN_LINES, includeTests = false, filePath }) => {
      const groups = await cloneIndex.refreshFor(graph, includeTests);
      const report = await buildDuplicateReport(graph, groups, {
        limit,
        minLines,
        includeTests,
        filePath: filePath ? resolveProjectFilePath(graph, filePath) : undefined,
      });
      return okStatusToolResult(report);
    }
  );
}
