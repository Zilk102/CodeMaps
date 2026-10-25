/**
 * Registers `setup_project`: the one tool a connecting agent calls first. It configures the whole
 * project for CodeMaps (agent rules, skill, edit hook, `.codemaps` config and baseline) so the
 * user only has to connect the MCP server.
 */
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import * as z from 'zod/v4';
import { createProjectBaseline } from '../analysis/baseline';
import { AGENT_IDS } from '../setup/types';
import { setupProject } from '../setup/setupProject';
import { resolveSetupRoot } from '../setup/setupRoot';
import { resolveAppVersion } from './appVersion';
import { defineTool } from './defineTool';
import { graphForSetup } from './setupGraph';
import { optionalBoolean } from './toolSchemas';
import { okStatusToolResult } from './toolSupport';

/** Registers `setup_project`; the calling client's name (from the MCP handshake) picks the agent files. */
export function registerSetupTools(server: McpServer) {
  defineTool(
    server,
    {
      name: 'setup_project',
      title: 'Setup Project',
      description:
        'Configure the project for AI agents in one call. Detects the stack, its test/lint/build commands and the agent in use, then writes the guardrails: an AGENTS.md section, the agent rules (CLAUDE.md, Cursor, Copilot, Gemini, Windsurf, Cline, OpenCode, DeepSeek Harness), the CodeMaps skill, an edit-validation hook, .codemaps/config.json, a baseline that freezes legacy findings and the CI wiring of the headless codemaps-guard (a GitHub Actions workflow, or a portable script). Idempotent, cheap when up to date, never overwrites user content, writes only inside the project. Requires projectPath: the absolute path of the project you are working in (your current working directory).',
      inputSchema: {
        projectPath: z
          .string()
          .describe(
            'Absolute path of the project you are working in: your current working directory. Required; there is no fallback to the project open in the CodeMaps window, and the filesystem root and the home directory are rejected.'
          ),
        agents: z
          .array(z.enum(AGENT_IDS))
          .optional()
          .describe(
            'Agents to write rules for (claude, cursor, codex, copilot, gemini, windsurf, cline, opencode, dsh). Default: detected from the project and the calling client; an unrecognized client gets the universal AGENTS.md section'
          ),
        apply: optionalBoolean('When false, only report what would be written (default true)'),
        force: optionalBoolean(
          'Rewrite CodeMaps-owned sections even when their version is current (default false)'
        ),
      },
    },
    async ({ projectPath, agents, apply = true, force = false }) => {
      const result = await setupProject(
        {
          root: resolveSetupRoot(projectPath),
          version: resolveAppVersion(),
          clientName: server.server.getClientVersion()?.name,
          agents,
          apply,
          force,
        },
        { createBaseline: async (root) => createProjectBaseline(await graphForSetup(root)) }
      );
      return okStatusToolResult(result);
    }
  );
}
