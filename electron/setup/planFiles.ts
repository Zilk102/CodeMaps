/**
 * Decides which files `setup_project` writes for a project and what goes into each. The plan is
 * pure data (path, strategy, content): applying it is a separate step, so a dry run can show the
 * same plan without touching the disk.
 */
import * as fs from 'fs';
import * as path from 'path';
import { planCiFiles } from './ciFiles';
import { HOOK_COMMAND, HOOK_SCRIPT_PATH } from './claudeSettings';
import { FILE_MARKER_TOKEN } from './markers';
import { HOOK_TEMPLATE } from './templates/hookTemplate';
import { buildGuidelines } from './templates/guidelines';
import { SKILL_TEMPLATE } from './templates/skillTemplate';
import type { AgentId, DetectedProject, PlannedFile } from './types';

/** Where agents reach CodeMaps; the skill tells them which endpoint to expect. */
export const DEFAULT_MCP_ENDPOINT = 'http://127.0.0.1:3005/mcp';

/** Path of the skill file inside the project. */
export const SKILL_PATH = '.claude/skills/codemaps-agent-autopilot/SKILL.md';

/** Path of the settings file that receives the hook entry. */
export const CLAUDE_SETTINGS_PATH = '.claude/settings.json';

/** Path of the CodeMaps-owned copy of the edit hook. */
export const HOOK_FILE_PATH = HOOK_SCRIPT_PATH;

const CLAUDE_MD_BODY = `@AGENTS.md

The \`codemaps-agent-autopilot\` skill in \`.claude/skills\` repeats these rules in full, and a hook (\`${HOOK_SCRIPT_PATH}\`) validates every file you edit.`;

/** A rules file with front matter and the shared guidance, owned by CodeMaps. */
const rulesFile = (filePath: string, frontMatter: string, guidance: string): PlannedFile => ({
  path: filePath,
  strategy: 'owned',
  style: 'html',
  content: `${frontMatter}\n${FILE_MARKER_TOKEN}\n\n${guidance}`,
});

const CURSOR_FRONT_MATTER = `---
description: How to use the CodeMaps MCP tools in this project
alwaysApply: true
---`;

const WINDSURF_FRONT_MATTER = `---
trigger: always_on
---`;

/** `.clinerules` is a file in older Cline versions and a folder in current ones; the file is never replaced. */
const isClineRulesFile = (root: string): boolean => {
  try {
    return fs.statSync(path.join(root, '.clinerules')).isFile();
  } catch {
    return false;
  }
};

/** Everything Claude Code needs: the CLAUDE.md import, the skill, the hook entry and the hook script. */
const claudeFiles = (): PlannedFile[] => [
  block('CLAUDE.md', CLAUDE_MD_BODY),
  {
    path: SKILL_PATH,
    strategy: 'owned',
    style: 'html',
    content: SKILL_TEMPLATE.split('__ENDPOINT__').join(DEFAULT_MCP_ENDPOINT),
  },
  { path: CLAUDE_SETTINGS_PATH, strategy: 'claude-hook', content: HOOK_COMMAND },
  { path: HOOK_FILE_PATH, strategy: 'owned', style: 'slash', content: HOOK_TEMPLATE },
];

type AgentPlanner = (root: string, guidance: string) => PlannedFile[];

const block = (filePath: string, content: string): PlannedFile => ({
  path: filePath,
  strategy: 'block',
  content,
});

/** The extra files each agent needs on top of AGENTS.md; `codex` reads AGENTS.md itself. */
const AGENT_PLANNERS: Record<AgentId, AgentPlanner> = {
  claude: () => claudeFiles(),
  cursor: (_root, guidance) => [
    rulesFile('.cursor/rules/codemaps.mdc', CURSOR_FRONT_MATTER, guidance),
  ],
  codex: () => [],
  copilot: (_root, guidance) => [block('.github/copilot-instructions.md', guidance)],
  gemini: (_root, guidance) => [block('GEMINI.md', guidance)],
  windsurf: (_root, guidance) => [
    rulesFile('.windsurf/rules/codemaps.md', WINDSURF_FRONT_MATTER, guidance),
  ],
  cline: (root, guidance) =>
    isClineRulesFile(root)
      ? [block('.clinerules', guidance)]
      : [rulesFile('.clinerules/codemaps.md', '', guidance)],
};

/** Keeps CodeMaps' disposable graph cache out of git; the other files in `.codemaps` are meant to be committed. */
const CODEMAPS_GITIGNORE: PlannedFile = {
  path: '.codemaps/.gitignore',
  strategy: 'owned',
  style: 'hash',
  content: `${FILE_MARKER_TOKEN}\ngraph.db*\n`,
};

/**
 * The files to write for `agents`: AGENTS.md always (the universal file), the per-agent files for
 * every selected agent, the CI wiring of the guard (pinned to `version`) and the `.codemaps` cache
 * ignore. Paths are unique and relative to `root`.
 */
export const planFiles = (
  root: string,
  agents: AgentId[],
  detected: DetectedProject,
  version: string
): PlannedFile[] => {
  const guidance = buildGuidelines(detected);
  const files: PlannedFile[] = [block('AGENTS.md', guidance)];
  for (const agent of agents) files.push(...AGENT_PLANNERS[agent](root, guidance));
  files.push(...planCiFiles(root, detected, version), CODEMAPS_GITIGNORE);
  const seen = new Set<string>();
  return files.filter((file) => !seen.has(file.path) && Boolean(seen.add(file.path)));
};
