/**
 * Registers `check_documentation`: the documentation coverage of the open project (or of one file
 * or folder), the undocumented public symbols with a hint on what each comment must say, and
 * optionally the comments that say nothing. Agents call it after writing code.
 */
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import {
  MAX_DOCUMENTATION_LIMIT,
  buildDocumentationToolReport,
  documentationIndex,
} from '../analysis/documentation';
import { defineGraphTool } from './defineTool';
import { boundedInt, optionalBoolean, optionalString, projectPathField } from './toolSchemas';
import { okStatusToolResult } from './toolSupport';
import { resolveProjectFilePath } from './utils';

/** Registers the `check_documentation` tool on the MCP server. */
export function registerDocumentationTools(server: McpServer) {
  defineGraphTool(
    server,
    {
      name: 'check_documentation',
      title: 'Check Documentation',
      description:
        'Measure documentation coverage and say what to write: coverage of the public symbols, per-language bars, the files with the most gaps, and every undocumented symbol (file, line, name, kind) with a hint on what its comment must state (purpose, contract, why). Optionally lists comments that only repeat the name.',
      inputSchema: {
        projectPath: projectPathField,
        filePath: optionalString(
          'Only this file, or the files below this folder (absolute, or relative to the project root)'
        ),
        limit: boundedInt(MAX_DOCUMENTATION_LIMIT, 'Maximum number of items per list (default 25)'),
        includeLowQuality: optionalBoolean(
          'When true, also list documented symbols whose comment only repeats the name or is too short (default false)'
        ),
      },
    },
    async (graph, { filePath, limit, includeLowQuality }) => {
      const report = await documentationIndex.refreshFor(graph);
      const result = buildDocumentationToolReport(report, {
        scope: filePath ? resolveProjectFilePath(graph, filePath) : undefined,
        limit,
        includeLowQuality,
      });
      return okStatusToolResult(result, { limit: MAX_DOCUMENTATION_LIMIT });
    }
  );
}
