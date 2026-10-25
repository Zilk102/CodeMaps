/**
 * What `setup_project` writes for OpenCode and for the DeepSeek Harness on top of AGENTS.md, and
 * the remarks and manual steps that explain those choices. OpenCode also reads `.claude/skills`,
 * so its own copy of the skill is skipped whenever the Claude one exists or is being written.
 */
import * as fs from 'fs';
import * as path from 'path';
import { DSH_OVERLAY_COMMAND, DSH_OVERLAY_PATH, dshOverlayTemplate } from './deepSeekOverlay';
import { OPENCODE_CONFIG_PATH, OPENCODE_JSONC_PATH, openCodeSnippet } from './openCodeConfig';
import { skillFile } from './skillFile';
import { OPENCODE_PLUGIN_TEMPLATE } from './templates/openCodePlugin';
import type { AgentId, FileOutcome, PlanContext, PlannedFile } from './types';

/** The skill path OpenCode reads on its own. */
const OPENCODE_SKILL_PATH = '.opencode/skills/codemaps-agent-autopilot/SKILL.md';

/** The skill folder of Claude Code, which OpenCode also reads. */
const CLAUDE_SKILL_DIR = '.claude/skills/codemaps-agent-autopilot';

/** Path of the best-effort OpenCode plugin. */
export const OPENCODE_PLUGIN_PATH = '.opencode/plugins/codemaps-validate.ts';

/** Whether OpenCode finds the skill in `.claude/skills` already (or will, because Claude's files are written too). */
const claudeSkillCovers = (ctx: PlanContext): boolean =>
  ctx.agents.includes('claude') || fs.existsSync(path.join(ctx.root, CLAUDE_SKILL_DIR));

/** The config the MCP entry targets: the JSONC file when it exists (it is then only reported), else opencode.json. */
const configPath = (root: string): string =>
  fs.existsSync(path.join(root, OPENCODE_JSONC_PATH)) ? OPENCODE_JSONC_PATH : OPENCODE_CONFIG_PATH;

/** The files OpenCode needs: the skill (unless `.claude/skills` has it), the MCP entry and the best-effort edit plugin. */
export const openCodeFiles = (ctx: PlanContext): PlannedFile[] => [
  ...(claudeSkillCovers(ctx) ? [] : [skillFile(OPENCODE_SKILL_PATH, ctx.endpoint)]),
  { path: configPath(ctx.root), strategy: 'opencode-config', content: ctx.endpoint },
  {
    path: OPENCODE_PLUGIN_PATH,
    strategy: 'owned',
    style: 'slash',
    content: OPENCODE_PLUGIN_TEMPLATE,
  },
];

/** The files the DeepSeek Harness needs: only the overlay, because AGENTS.md is all it is known to read. */
export const dshFiles = (ctx: PlanContext): PlannedFile[] => [
  {
    path: DSH_OVERLAY_PATH,
    strategy: 'owned',
    style: 'hash',
    content: dshOverlayTemplate(ctx.endpoint),
  },
];

/** Remarks about choices made for these agents (not problems). */
export const agentNotes = (ctx: PlanContext): string[] => {
  const notes: string[] = [];
  if (ctx.agents.includes('opencode')) {
    if (claudeSkillCovers(ctx)) {
      notes.push(
        'OpenCode also reads .claude/skills, so no second copy of the codemaps-agent-autopilot skill was written to .opencode/skills.'
      );
    }
    notes.push(
      'The OpenCode plugin .opencode/plugins/codemaps-validate.ts is best-effort: OpenCode plugin payload shapes are not fully documented, so it stays silent on shapes it does not recognize.'
    );
  }
  if (ctx.agents.includes('dsh')) {
    notes.push(
      'DeepSeek Harness (developer preview) is best-effort: it is known to read AGENTS.md, while skills, slash commands and a post-edit hook are not documented for it. The AGENTS.md section is therefore the whole guidance, and the agent must call validate_architecture_changes itself after edits.'
    );
  }
  return notes;
};

/** What the person still has to do by hand for OpenCode and the DeepSeek Harness, given what was written. */
export const agentSteps = (
  outcomes: FileOutcome[],
  agents: AgentId[],
  endpoint: string
): string[] => {
  const steps: string[] = [];
  const config = outcomes.find(
    (outcome) => outcome.path === OPENCODE_CONFIG_PATH || outcome.path === OPENCODE_JSONC_PATH
  );
  if (agents.includes('opencode') && config?.action === 'skipped') {
    steps.push(
      `CodeMaps did not edit ${config.path} (${config.reason}). Merge this into it, keeping the existing "mcp" key: ${openCodeSnippet(endpoint).replace(/\s+/g, ' ')}`
    );
  }
  if (agents.includes('dsh')) {
    steps.push(
      `DeepSeek Harness registers MCP servers host-wide, so CodeMaps wrote a ready overlay and nothing outside the project. Start it with: ${DSH_OVERLAY_COMMAND}. For a permanent setup copy the "- insert:" entry of ${DSH_OVERLAY_PATH} into the cordis.patch.yml of your DSH home (default probably ~/.dsh, unconfirmed) or profile.`
    );
  }
  return steps;
};
