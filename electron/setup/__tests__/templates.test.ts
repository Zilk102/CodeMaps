import * as fs from 'fs';
import * as path from 'path';
import { describe, expect, it } from 'vitest';
import { FILE_MARKER_TOKEN } from '../markers';
import { buildGuidelines } from '../templates/guidelines';
import { HOOK_TEMPLATE } from '../templates/hookTemplate';
import { SKILL_TEMPLATE } from '../templates/skillTemplate';
import { MCP_TOOLS } from '../../mcp/descriptors';

const repo = path.resolve(__dirname, '../../..');
const read = (relative: string) =>
  fs.readFileSync(path.join(repo, relative), 'utf-8').replace(/\r\n/g, '\n');

const REGENERATE = 'Run `npm run sync:templates` and `npm run format`.';

describe('shipped agent files stay in sync with their sources', () => {
  it('embeds scripts/codemaps-validate-hook.mjs as the hook template', () => {
    expect(HOOK_TEMPLATE.replace(`${FILE_MARKER_TOKEN}\n`, ''), REGENERATE).toBe(
      read('scripts/codemaps-validate-hook.mjs')
    );
    expect(HOOK_TEMPLATE.startsWith(`#!/usr/bin/env node\n${FILE_MARKER_TOKEN}\n`)).toBe(true);
  });

  it('embeds the repository skill as the skill template', () => {
    const skill = read('.claude/skills/codemaps-agent-autopilot/SKILL.md');
    const template = SKILL_TEMPLATE.replace(`${FILE_MARKER_TOKEN}\n\n`, '').replace(
      '__ENDPOINT__',
      'http://127.0.0.1:3005/mcp'
    );
    expect(template, REGENERATE).toBe(skill);
    expect(SKILL_TEMPLATE).toContain(FILE_MARKER_TOKEN);
  });

  it('uses the same skill in the in-app template', () => {
    const component = read('src/components/mcp-settings/McpSettingsAgentSkill.tsx');
    const start = component.indexOf('const SKILL_TEMPLATE = `') + 'const SKILL_TEMPLATE = `'.length;
    const literal = component.slice(start, component.indexOf('\n`;\n', start) + 1);
    const inApp = new Function(`return \`${literal}\``)() as string;
    expect(inApp, REGENERATE).toBe(
      read('.claude/skills/codemaps-agent-autopilot/SKILL.md').replace(
        'http://127.0.0.1:3005/mcp',
        '__ENDPOINT__'
      )
    );
  });
});

describe('written guidance', () => {
  const toolNamesIn = (text: string) =>
    [...text.matchAll(/`([a-z]+(?:_[a-z0-9]+)+)`/g)].map((m) => m[1]);
  const knownTools = new Set(MCP_TOOLS.map((tool) => tool.name));

  it('names only tools that exist', () => {
    const texts = [
      buildGuidelines({ languages: [], packageManager: null, commands: {}, ci: [] }),
      SKILL_TEMPLATE,
    ];
    for (const text of texts) {
      const unknown = toolNamesIn(text).filter(
        (name) => !knownTools.has(name) && name !== 'missing_documentation'
      );
      expect(unknown).toEqual([]);
    }
  });

  it('lists the detected commands and omits the section when there are none', () => {
    const none = buildGuidelines({ languages: [], packageManager: null, commands: {}, ci: [] });
    expect(none).not.toContain('Project commands');
    const some = buildGuidelines({
      languages: ['Go'],
      packageManager: 'go',
      commands: { test: 'go test ./...' },
      ci: [],
    });
    expect(some).toContain('- Test: `go test ./...`');
  });

  it('tells agents to call setup_project and states the documentation rules', () => {
    const text = SKILL_TEMPLATE;
    expect(text).toContain('setup_project');
    expect(text).toContain('purpose, the contract');
    expect(text).toContain('prepare_change_campaign');
    expect(text).toContain('analyze_decomposition');
    expect(text).toContain('get_semantic_skeleton');
  });
});
