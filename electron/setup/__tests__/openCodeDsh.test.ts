import * as fs from 'fs';
import * as path from 'path';
import { pathToFileURL } from 'url';
import { afterEach, describe, expect, it } from 'vitest';
import { agentFromClientName, detectAgents } from '../detectAgents';
import { DSH_OVERLAY_COMMAND, DSH_OVERLAY_PATH } from '../deepSeekOverlay';
import { mergeOpenCodeConfig } from '../openCodeConfig';
import { fileMarker, FILE_MARKER_TOKEN } from '../markers';
import { setupProject } from '../setupProject';
import { OPENCODE_PLUGIN_TEMPLATE } from '../templates/openCodePlugin';
import { cleanTemp, exists, fakeBaseline, listFiles, options, readFile, tempProject } from './kit';

afterEach(cleanTemp);

const ENDPOINT = 'http://127.0.0.1:3005/mcp';
const deps = () => ({ createBaseline: fakeBaseline().create });
const SKILL = '.claude/skills/codemaps-agent-autopilot/SKILL.md';
const OC_SKILL = '.opencode/skills/codemaps-agent-autopilot/SKILL.md';
const PLUGIN = '.opencode/plugins/codemaps-validate.ts';

describe('detection of OpenCode and DeepSeek Harness', () => {
  it.each([
    ['opencode', 'opencode'],
    ['OpenCode', 'opencode'],
    ['open-code-cli', 'opencode'],
    ['dsh', 'dsh'],
    ['DSH-MCP-Client', 'dsh'],
    ['deepseek-harness', 'dsh'],
    ['DeepSeek', 'dsh'],
  ])('maps the client %s to %s', (name, agent) => {
    expect(agentFromClientName(name)).toBe(agent);
  });

  it('detects OpenCode from its project files and never DeepSeek Harness from files', () => {
    for (const file of ['opencode.json', 'opencode.jsonc', '.opencode/agents/a.md']) {
      expect(detectAgents(tempProject({ [file]: '' }), 'mystery').fromProject).toEqual([
        'opencode',
      ]);
    }
    const marked = tempProject({ '.dsh/x': '', '.codemaps/dsh/cordis.patch.yml': '' });
    expect(detectAgents(marked, null).selected).toEqual([]);
  });

  it('selects the agents named by the client', () => {
    expect(detectAgents(tempProject(), 'opencode').selected).toEqual(['opencode']);
    expect(detectAgents(tempProject(), 'dsh').selected).toEqual(['dsh']);
  });

  it('says explicitly what an unknown client got', async () => {
    const root = tempProject();
    const result = await setupProject(options(root, { clientName: 'mystery' }), deps());
    expect(result.detected.agents.fromClient).toBeNull();
    expect(result.detected.agents.note).toContain('AGENTS.md');
    expect(result.notes.join(' ')).toContain('"mystery" was not recognized');
    expect(result.written).toContain('AGENTS.md');
    const known = await setupProject(options(tempProject(), { clientName: 'cursor' }), deps());
    expect(known.detected.agents.note).toBeUndefined();
  });
});

describe('setup_project for OpenCode', () => {
  it('writes AGENTS.md, the skill, a new opencode.json and the plugin', async () => {
    const root = tempProject();
    const result = await setupProject(options(root, { clientName: 'opencode' }), deps());
    expect(result.status).toBe('ok');
    expect(result.written).toEqual(
      expect.arrayContaining(['AGENTS.md', OC_SKILL, 'opencode.json', PLUGIN])
    );
    expect(exists(root, 'CLAUDE.md')).toBe(false);
    expect(JSON.parse(readFile(root, 'opencode.json'))).toEqual({
      $schema: 'https://opencode.ai/config.json',
      mcp: { codemaps: { type: 'remote', url: ENDPOINT, enabled: true } },
    });
    expect(readFile(root, OC_SKILL)).toContain("name: 'codemaps-agent-autopilot'");
    expect(readFile(root, PLUGIN).startsWith('// codemaps:file v1.2.0\n')).toBe(true);
  });

  it('writes no second skill when Claude Code files are written, and says why', async () => {
    const root = tempProject();
    const result = await setupProject(options(root, { agents: ['claude', 'opencode'] }), deps());
    expect(exists(root, SKILL)).toBe(true);
    expect(exists(root, OC_SKILL)).toBe(false);
    expect(result.notes.join(' ')).toContain('no second copy');
  });

  it('writes no second skill when the Claude skill already exists', async () => {
    const root = tempProject({ [SKILL]: 'mine' });
    await setupProject(options(root, { agents: ['opencode'] }), deps());
    expect(exists(root, OC_SKILL)).toBe(false);
    expect(readFile(root, SKILL)).toBe('mine');
  });

  it('merges into an existing opencode.json and keeps other servers', async () => {
    const root = tempProject({
      'opencode.json': JSON.stringify({
        model: 'x',
        mcp: { other: { type: 'local', command: ['a'] } },
      }),
    });
    await setupProject(options(root, { agents: ['opencode'] }), deps());
    const config = JSON.parse(readFile(root, 'opencode.json'));
    expect(config.model).toBe('x');
    expect(config.mcp.other).toEqual({ type: 'local', command: ['a'] });
    expect(config.mcp.codemaps).toEqual({ type: 'remote', url: ENDPOINT, enabled: true });
  });

  it('merges into mcp.servers when the file already uses that layout', () => {
    const existing = JSON.stringify({ mcp: { servers: { other: { url: 'u' } } } });
    const merge = mergeOpenCodeConfig(existing, ENDPOINT);
    expect(merge.outcome).toBe('merged');
    const config = JSON.parse(merge.text ?? '');
    expect(Object.keys(config.mcp.servers)).toEqual(['other', 'codemaps']);
    expect(config.mcp.codemaps).toBeUndefined();
  });

  it('never replaces an existing codemaps entry', () => {
    const existing = JSON.stringify({ mcp: { codemaps: { type: 'remote', url: 'http://x/mcp' } } });
    expect(mergeOpenCodeConfig(existing, ENDPOINT)).toEqual({ outcome: 'unchanged' });
  });

  it.each([
    ['comments', '{ // c\n "mcp": {} }'],
    ['an array', '[]'],
    ['a non-object mcp', '{"mcp": 3}'],
  ])('skips a config with %s', (_name, text) => {
    expect(mergeOpenCodeConfig(text, ENDPOINT).outcome).toBe('skipped');
  });

  it('leaves opencode.jsonc alone and hands over the exact snippet', async () => {
    const root = tempProject({ 'opencode.jsonc': '{ // mine\n}' });
    const result = await setupProject(options(root, { agents: ['opencode'] }), deps());
    expect(readFile(root, 'opencode.jsonc')).toBe('{ // mine\n}');
    expect(exists(root, 'opencode.json')).toBe(false);
    expect(result.skipped.map((entry) => entry.path)).toContain('opencode.jsonc');
    expect(result.nextSteps.join(' ')).toContain('"type": "remote"');
    expect(result.nextSteps.join(' ')).toContain(ENDPOINT);
  });

  it('leaves an invalid opencode.json alone and reports the snippet', async () => {
    const root = tempProject({ 'opencode.json': '{ broken' });
    const result = await setupProject(options(root, { agents: ['opencode'] }), deps());
    expect(readFile(root, 'opencode.json')).toBe('{ broken');
    expect(result.nextSteps.join(' ')).toContain(ENDPOINT);
  });

  it('is idempotent and its dry run writes nothing', async () => {
    const root = tempProject();
    const dry = await setupProject(options(root, { agents: ['opencode'], apply: false }), deps());
    expect(listFiles(root)).toEqual([]);
    expect(dry.wouldWrite).toEqual(expect.arrayContaining([{ path: PLUGIN, action: 'create' }]));
    await setupProject(options(root, { agents: ['opencode'] }), deps());
    const again = await setupProject(options(root, { agents: ['opencode'] }), deps());
    expect(again.upToDate).toBe(true);
    expect(again.written).toEqual([]);
  });
});

describe('the OpenCode plugin', () => {
  const load = async (root: string) => {
    const file = path.join(root, 'plugin.mjs');
    fs.writeFileSync(
      file,
      OPENCODE_PLUGIN_TEMPLATE.replace(FILE_MARKER_TOKEN, fileMarker('1.2.0', 'slash'))
    );
    const module = (await import(/* @vite-ignore */ pathToFileURL(file).href)) as {
      CodeMapsValidate: (
        context: unknown
      ) => Promise<Record<string, (...args: unknown[]) => Promise<void>>>;
    };
    return module.CodeMapsValidate;
  };

  it('is marked best-effort, has the version marker and exports one plugin', () => {
    expect(OPENCODE_PLUGIN_TEMPLATE).toContain('BEST-EFFORT');
    expect(OPENCODE_PLUGIN_TEMPLATE).toContain('tool.execute.after');
    expect(OPENCODE_PLUGIN_TEMPLATE).toContain('file.edited');
    expect(OPENCODE_PLUGIN_TEMPLATE.startsWith(FILE_MARKER_TOKEN)).toBe(true);
    expect(OPENCODE_PLUGIN_TEMPLATE.match(/^export /gm)).toHaveLength(1);
  });

  it('never throws on malformed inputs', async () => {
    const root = tempProject();
    const plugin = await load(root);
    const circular: Record<string, unknown> = { tool: 'edit' };
    circular.args = circular;
    const hostile = {
      get tool(): string {
        throw new Error('boom');
      },
    };
    const badContexts = [undefined, null, 5, 'x', { directory: 42 }, hostile];
    for (const context of badContexts) {
      const handlers = await plugin(context);
      const inputs: unknown[] = [
        undefined,
        null,
        1,
        'edit',
        {},
        circular,
        hostile,
        { tool: 'edit' },
      ];
      for (const input of inputs) {
        for (const output of [undefined, null, {}, { output: 5 }, circular]) {
          await expect(handlers['tool.execute.after']?.(input, output)).resolves.toBeUndefined();
        }
        await expect(handlers.event?.(input)).resolves.toBeUndefined();
        await expect(handlers.event?.({ event: input })).resolves.toBeUndefined();
      }
    }
  });

  it('stays silent when the hook is not installed', async () => {
    const root = tempProject();
    const handlers = await (await load(root))({ directory: root });
    const output = { output: 'done' };
    await handlers['tool.execute.after']?.({ tool: 'edit', args: { filePath: 'a.ts' } }, output);
    expect(output.output).toBe('done');
  });

  it('appends the hook report to the output of an edit tool', async () => {
    const root = tempProject({
      '.codemaps/hooks/validate.mjs': `import fs from 'node:fs';
let text = '';
for await (const chunk of process.stdin) text += chunk;
fs.writeFileSync('stdin.json', text);
process.stderr.write('god file found');
process.exit(2);
`,
    });
    const handlers = await (await load(root))({ directory: root });
    const output = { output: 'done' };
    await handlers['tool.execute.after']?.(
      { tool: 'Edit', args: { filePath: 'src/a.ts' } },
      output
    );
    expect(output.output).toBe('done\n\n[CodeMaps] god file found');
    expect(JSON.parse(readFile(root, 'stdin.json'))).toEqual({
      tool_name: 'Edit',
      tool_input: { file_path: 'src/a.ts' },
      cwd: root,
    });
    const other = { output: 'listing' };
    await handlers['tool.execute.after']?.({ tool: 'read', args: { filePath: 'src/a.ts' } }, other);
    expect(other.output).toBe('listing');
  });
});

describe('setup_project for the DeepSeek Harness', () => {
  it('writes AGENTS.md and the overlay, and tells how to use it', async () => {
    const root = tempProject();
    const result = await setupProject(options(root, { clientName: 'dsh' }), deps());
    expect(result.written).toEqual(expect.arrayContaining(['AGENTS.md', DSH_OVERLAY_PATH]));
    expect(exists(root, 'opencode.json')).toBe(false);
    const overlay = readFile(root, DSH_OVERLAY_PATH);
    expect(overlay.startsWith('# codemaps:file v1.2.0\n')).toBe(true);
    expect(overlay).toContain(
      `- insert:\n  - id: mcp-codemaps\n    name: '@deepseek-ai/dsh-mcp-client'\n    config:\n      serverName: codemaps\n      transport: streamable-http\n      url: ${ENDPOINT}\n`
    );
    expect(DSH_OVERLAY_COMMAND).toBe(`npx @deepseek-ai/dsh web --patch ${DSH_OVERLAY_PATH}`);
    expect(result.nextSteps.join(' ')).toContain(DSH_OVERLAY_COMMAND);
    expect(result.nextSteps.join(' ')).toContain('cordis.patch.yml');
    expect(result.notes.join(' ')).toContain('validate_architecture_changes');
    expect(readFile(root, 'AGENTS.md')).toContain('validate_architecture_changes');
  });

  it('writes only inside the project root', async () => {
    const parent = tempProject();
    const root = path.join(parent, 'project').split(path.sep).join('/');
    fs.mkdirSync(root);
    await setupProject(options(root, { agents: ['opencode', 'dsh'] }), deps());
    expect(fs.readdirSync(parent)).toEqual(['project']);
    for (const file of listFiles(root)) expect(path.isAbsolute(file)).toBe(false);
  });

  it('is idempotent and its dry run writes nothing', async () => {
    const root = tempProject();
    const dry = await setupProject(options(root, { agents: ['dsh'], apply: false }), deps());
    expect(listFiles(root)).toEqual([]);
    expect(dry.wouldWrite).toEqual(
      expect.arrayContaining([{ path: DSH_OVERLAY_PATH, action: 'create' }])
    );
    await setupProject(options(root, { agents: ['dsh'] }), deps());
    const again = await setupProject(options(root, { agents: ['dsh'] }), deps());
    expect(again.upToDate).toBe(true);
  });
});
