/**
 * Works out which AI agents a project is used with: from the files each agent leaves in a
 * repository, and from the name the calling MCP client reported on connect. An unknown client
 * adds nothing, so the universal AGENTS.md (always written) is all it gets, and the result says so.
 * DeepSeek Harness leaves no project files, so it is detected by client name or request only.
 */
import * as fs from 'fs';
import * as path from 'path';
import { AGENT_IDS, type AgentId, type DetectedAgents } from './types';

/** Files or folders whose presence means the project already uses an agent. */
const AGENT_FILES: Array<[AgentId, string[]]> = [
  ['claude', ['CLAUDE.md', '.claude']],
  ['cursor', ['.cursor', '.cursorrules']],
  ['codex', ['.codex']],
  ['copilot', ['.github/copilot-instructions.md']],
  ['gemini', ['GEMINI.md', '.gemini']],
  ['windsurf', ['.windsurf', '.windsurfrules']],
  ['cline', ['.clinerules', '.cline']],
  ['opencode', ['opencode.json', 'opencode.jsonc', '.opencode']],
];

/** Lower-case fragments of `clientInfo.name` and the agent each one identifies. */
const CLIENT_FRAGMENTS: Array<[string, AgentId]> = [
  ['claude', 'claude'],
  ['cursor', 'cursor'],
  ['codex', 'codex'],
  ['copilot', 'copilot'],
  ['vscode', 'copilot'],
  ['visual studio code', 'copilot'],
  ['visual-studio-code', 'copilot'],
  ['gemini', 'gemini'],
  ['windsurf', 'windsurf'],
  ['codeium', 'windsurf'],
  ['cline', 'cline'],
  ['roo-code', 'cline'],
  ['roocode', 'cline'],
  ['opencode', 'opencode'],
  ['open-code', 'opencode'],
  ['deepseek', 'dsh'],
  ['dsh', 'dsh'],
];

/** Maps the MCP `clientInfo.name` to an agent; null when the client is not recognized. */
export const agentFromClientName = (clientName: string | null | undefined): AgentId | null => {
  const name = (clientName ?? '').toLowerCase();
  return CLIENT_FRAGMENTS.find(([fragment]) => name.includes(fragment))?.[1] ?? null;
};

/** The agents whose files already exist under `root`. */
export const agentsInProject = (root: string): AgentId[] =>
  AGENT_FILES.filter(([, files]) => files.some((file) => fs.existsSync(path.join(root, file)))).map(
    ([agent]) => agent
  );

/** Tells the caller why an unrecognized client got only the universal file. */
const unknownClientNote = (clientName: string | null | undefined): string =>
  `The client ${clientName ? `"${clientName}"` : '(no name reported)'} was not recognized, so the universal AGENTS.md section was written (and rules for agents already present in the project). Pass agents to write the rules of a specific agent.`;

/**
 * Decides which agents get their own rules files. An explicit `requested` list wins over
 * detection; otherwise the project's existing agents plus the calling client are used.
 */
export const detectAgents = (
  root: string,
  clientName: string | null | undefined,
  requested?: AgentId[]
): DetectedAgents => {
  const fromProject = agentsInProject(root);
  const fromClient = agentFromClientName(clientName);
  const auto = fromClient ? [...fromProject, fromClient] : fromProject;
  const chosen = requested && requested.length > 0 ? requested : auto;
  const explicit = Boolean(requested && requested.length > 0);
  return {
    fromProject,
    fromClient,
    clientName: clientName ?? null,
    selected: AGENT_IDS.filter((agent) => chosen.includes(agent)),
    ...(fromClient || explicit ? {} : { note: unknownClientNote(clientName) }),
  };
};
