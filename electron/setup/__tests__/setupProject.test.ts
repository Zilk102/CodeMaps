import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { afterEach, describe, expect, it } from 'vitest';
import { createProjectBaseline } from '../../analysis/baseline';
import { functionOfLines, TestProject } from '../../analysis/__tests__/projectKit';
import { setupProject } from '../setupProject';
import {
  cleanTemp,
  exists,
  fakeBaseline,
  listFiles,
  options,
  readFile,
  tempProject,
  tryLink,
  writeFile,
} from './kit';

afterEach(cleanTemp);

const TS_PROJECT = {
  'package.json': JSON.stringify({ scripts: { test: 'vitest run' } }),
  'src/a.ts': 'export const a = 1;\n',
};

const snapshot = (root: string): Record<string, string> =>
  Object.fromEntries(listFiles(root).map((file) => [file, readFile(root, file)]));

describe('setupProject: first run', () => {
  it('writes the files of the calling agent and the universal ones', async () => {
    const root = tempProject(TS_PROJECT);
    const baseline = fakeBaseline();
    const result = await setupProject(options(root), { createBaseline: baseline.create });

    expect(result.status).toBe('ok');
    expect(result.upToDate).toBe(false);
    expect(result.written.sort()).toEqual(
      [
        '.claude/settings.json',
        '.claude/skills/codemaps-agent-autopilot/SKILL.md',
        '.codemaps/.gitignore',
        '.codemaps/baseline.json',
        '.codemaps/config.json',
        '.codemaps/hooks/validate.mjs',
        '.codemaps/setup.json',
        'AGENTS.md',
        'CLAUDE.md',
      ].sort()
    );
    expect(result.detected.commands.test).toBe('npm test');
    expect(result.detected.agents.fromClient).toBe('claude');
    expect(result.baseline).toMatchObject({ status: 'created', total: 1 });
    expect(result.ciSuggestion.text).toContain('npm test');
    expect(result.nextSteps.join(' ')).toContain('commit');
    expect(readFile(root, 'AGENTS.md')).toContain('`npm test`');
    expect(readFile(root, 'CLAUDE.md')).toContain('@AGENTS.md');
    expect(readFile(root, '.codemaps/hooks/validate.mjs')).toContain('codemaps:file v1.2.0');
    expect(JSON.parse(readFile(root, '.claude/settings.json')).hooks.PostToolUse).toHaveLength(1);
    const record = JSON.parse(readFile(root, '.codemaps/setup.json'));
    expect(record.codemapsVersion).toBe('1.2.0');
    expect(record.agents).toEqual(['claude']);
    expect(record.files.map((file: { path: string }) => file.path)).toContain('AGENTS.md');
  });

  it('writes only AGENTS.md for an unknown client', async () => {
    const root = tempProject();
    const result = await setupProject(options(root, { clientName: 'mystery' }), {
      createBaseline: fakeBaseline().create,
    });
    expect(result.written).toContain('AGENTS.md');
    expect(exists(root, 'CLAUDE.md')).toBe(false);
    expect(exists(root, '.cursor')).toBe(false);
  });

  it.each([
    ['cursor', '.cursor/rules/codemaps.mdc'],
    ['copilot', '.github/copilot-instructions.md'],
    ['gemini', 'GEMINI.md'],
    ['windsurf', '.windsurf/rules/codemaps.md'],
    ['cline', '.clinerules/codemaps.md'],
  ] as const)('writes the %s rules file', async (agent, file) => {
    const root = tempProject();
    await setupProject(options(root, { clientName: null, agents: [agent] }), {
      createBaseline: fakeBaseline().create,
    });
    expect(readFile(root, file)).toContain('setup_project');
    expect(exists(root, 'CLAUDE.md')).toBe(false);
  });

  it('gives the Cursor rule front matter that is always applied', async () => {
    const root = tempProject();
    await setupProject(options(root, { agents: ['cursor'] }), {
      createBaseline: fakeBaseline().create,
    });
    expect(readFile(root, '.cursor/rules/codemaps.mdc').startsWith('---\n')).toBe(true);
    expect(readFile(root, '.cursor/rules/codemaps.mdc')).toContain('alwaysApply: true');
  });

  it('adds the block to an old-style .clinerules file instead of replacing it', async () => {
    const root = tempProject({ '.clinerules': 'my cline rules\n' });
    await setupProject(options(root, { agents: ['cline'] }), {
      createBaseline: fakeBaseline().create,
    });
    expect(readFile(root, '.clinerules')).toMatch(/^my cline rules\n\n<!-- codemaps:start/);
  });
});

describe('setupProject: idempotency', () => {
  it('writes nothing on the second run and does not analyze the project again', async () => {
    const root = tempProject(TS_PROJECT);
    const baseline = fakeBaseline();
    await setupProject(options(root), { createBaseline: baseline.create });
    const before = snapshot(root);

    const second = await setupProject(options(root), { createBaseline: baseline.create });

    expect(second.upToDate).toBe(true);
    expect(second.written).toEqual([]);
    expect(second.updated).toEqual([]);
    expect(second.baseline.status).toBe('exists');
    expect(baseline.calls).toHaveLength(1);
    expect(snapshot(root)).toEqual(before);
  });

  it('serializes concurrent calls so exactly one of them writes', async () => {
    const root = tempProject(TS_PROJECT);
    const baseline = fakeBaseline();
    const results = await Promise.all(
      Array.from({ length: 4 }, () =>
        setupProject(options(root), { createBaseline: baseline.create })
      )
    );
    expect(results.filter((result) => result.written.length > 0)).toHaveLength(1);
    expect(results.filter((result) => result.upToDate)).toHaveLength(3);
    expect(baseline.calls).toHaveLength(1);
  });

  it('writes the next agent when another client connects later', async () => {
    const root = tempProject();
    const deps = { createBaseline: fakeBaseline().create };
    await setupProject(options(root, { clientName: 'claude-code' }), deps);
    const second = await setupProject(options(root, { clientName: 'cursor' }), deps);
    expect(second.written).toContain('.cursor/rules/codemaps.mdc');
    expect(JSON.parse(readFile(root, '.codemaps/setup.json')).agents).toEqual(['claude', 'cursor']);
  });
});

describe('setupProject: dry run', () => {
  it('writes nothing and lists what it would write', async () => {
    const root = tempProject(TS_PROJECT);
    const before = snapshot(root);
    const baseline = fakeBaseline();

    const result = await setupProject(options(root, { apply: false }), {
      createBaseline: baseline.create,
    });

    expect(snapshot(root)).toEqual(before);
    expect(baseline.calls).toHaveLength(0);
    expect(result.status).toBe('dry-run');
    expect(result.written).toEqual([]);
    expect(result.wouldWrite).toEqual(
      expect.arrayContaining([
        { path: 'AGENTS.md', action: 'create' },
        { path: '.codemaps/baseline.json', action: 'create' },
      ])
    );
    expect(result.upToDate).toBe(false);
  });

  it('reports an up to date project as such', async () => {
    const root = tempProject();
    const deps = { createBaseline: fakeBaseline().create };
    await setupProject(options(root), deps);
    const dry = await setupProject(options(root, { apply: false }), deps);
    expect(dry.upToDate).toBe(true);
    expect(dry.wouldWrite).toEqual([]);
  });
});

describe('setupProject: user content', () => {
  it('appends to existing agent files and keeps what the user wrote', async () => {
    const root = tempProject({
      'AGENTS.md': '# My rules\n\nBe nice.\n',
      'CLAUDE.md': 'Project notes\n',
      '.claude/settings.json': JSON.stringify({
        permissions: { allow: ['Bash(ls)'] },
        hooks: {
          PostToolUse: [{ matcher: 'Write', hooks: [{ type: 'command', command: 'lint' }] }],
        },
      }),
    });
    const result = await setupProject(options(root), { createBaseline: fakeBaseline().create });

    expect(result.updated).toEqual(
      expect.arrayContaining(['AGENTS.md', 'CLAUDE.md', '.claude/settings.json'])
    );
    expect(
      readFile(root, 'AGENTS.md').startsWith('# My rules\n\nBe nice.\n\n<!-- codemaps:start')
    ).toBe(true);
    expect(readFile(root, 'CLAUDE.md').startsWith('Project notes\n\n<!-- codemaps:start')).toBe(
      true
    );
    const settings = JSON.parse(readFile(root, '.claude/settings.json'));
    expect(settings.permissions).toEqual({ allow: ['Bash(ls)'] });
    expect(settings.hooks.PostToolUse).toHaveLength(2);
    expect(settings.hooks.PostToolUse[0].hooks[0].command).toBe('lint');
  });

  it('skips invalid JSON, says so, and still writes everything else', async () => {
    const root = tempProject({ '.claude/settings.json': '{ "hooks": // broken' });
    const result = await setupProject(options(root), { createBaseline: fakeBaseline().create });

    expect(readFile(root, '.claude/settings.json')).toBe('{ "hooks": // broken');
    expect(result.status).toBe('partial');
    expect(result.skipped).toEqual([
      { path: '.claude/settings.json', reason: expect.stringContaining('not valid JSON') },
    ]);
    expect(result.warnings[0]).toContain('.claude/settings.json');
    expect(result.written).toContain('AGENTS.md');
  });

  it('leaves a same-named file that CodeMaps does not own', async () => {
    const root = tempProject({ '.cursor/rules/codemaps.mdc': 'my rule' });
    const result = await setupProject(options(root, { agents: ['cursor'] }), {
      createBaseline: fakeBaseline().create,
    });
    expect(readFile(root, '.cursor/rules/codemaps.mdc')).toBe('my rule');
    expect(result.skipped[0].path).toBe('.cursor/rules/codemaps.mdc');
  });

  it('never overwrites an existing config or baseline', async () => {
    const root = tempProject({
      '.codemaps/config.json': '{"exclude":["vendor"]}',
      '.codemaps/baseline.json': '{"version":1,"createdAt":"x","entries":{"clone|a.ts|f":7}}',
    });
    const baseline = fakeBaseline();
    const result = await setupProject(options(root, { force: true }), {
      createBaseline: baseline.create,
    });
    expect(readFile(root, '.codemaps/config.json')).toBe('{"exclude":["vendor"]}');
    expect(baseline.calls).toHaveLength(0);
    expect(result.baseline).toMatchObject({ status: 'exists', total: 1, byKind: { clone: 1 } });
  });

  it('does not create a baseline in strict mode', async () => {
    const root = tempProject({ '.codemaps/config.json': '{"mode":"strict"}' });
    const baseline = fakeBaseline();
    const result = await setupProject(options(root), { createBaseline: baseline.create });
    expect(result.baseline.status).toBe('skipped');
    expect(baseline.calls).toHaveLength(0);
  });

  it('reports a failing baseline without losing the other files', async () => {
    const root = tempProject();
    const result = await setupProject(options(root), {
      createBaseline: async () => {
        throw new Error('cannot index');
      },
    });
    expect(result.status).toBe('partial');
    expect(result.upToDate).toBe(false);
    expect(result.baseline).toMatchObject({ status: 'failed', reason: 'cannot index' });
    expect(result.warnings).toContain('baseline not created: cannot index');
    expect(exists(root, 'AGENTS.md')).toBe(true);
  });

  it('skips CLAUDE.md when it is a link to AGENTS.md', async () => {
    const root = tempProject({ 'docs/AGENTS.md': 'shared\n' });
    fs.mkdirSync(path.join(root, 'x'));
    // A file link needs privileges on Windows; a folder link cannot stand for CLAUDE.md.
    try {
      fs.symlinkSync(path.join(root, 'AGENTS.md'), path.join(root, 'CLAUDE.md'));
    } catch {
      return;
    }
    writeFile(root, 'AGENTS.md', 'shared\n');
    const result = await setupProject(options(root), { createBaseline: fakeBaseline().create });
    expect(result.skipped).toContainEqual({ path: 'CLAUDE.md', reason: 'same file as AGENTS.md' });
  });
});

describe('setupProject: versions', () => {
  it('refreshes only blocks and files older than the running version', async () => {
    const root = tempProject({ 'AGENTS.md': 'mine\n' });
    const deps = { createBaseline: fakeBaseline().create };
    await setupProject(options(root, { version: '1.0.0' }), deps);
    writeFile(
      root,
      'CLAUDE.md',
      readFile(root, 'CLAUDE.md')
        .replace('v1.0.0', 'v9.0.0')
        .replace('@AGENTS.md', 'edited by hand')
    );

    const result = await setupProject(options(root, { version: '1.1.0' }), deps);

    expect(result.updated).toEqual(
      expect.arrayContaining([
        'AGENTS.md',
        '.claude/skills/codemaps-agent-autopilot/SKILL.md',
        '.codemaps/hooks/validate.mjs',
      ])
    );
    expect(readFile(root, 'AGENTS.md')).toContain('codemaps:start v1.1.0');
    expect(readFile(root, 'AGENTS.md').startsWith('mine\n')).toBe(true);
    expect(readFile(root, 'CLAUDE.md')).toContain('edited by hand');
    expect(result.skipped).toContainEqual({
      path: 'CLAUDE.md',
      reason: expect.stringContaining('newer'),
    });
  });

  it('rewrites a current section only with force', async () => {
    const root = tempProject();
    const deps = { createBaseline: fakeBaseline().create };
    await setupProject(options(root), deps);
    writeFile(root, 'AGENTS.md', readFile(root, 'AGENTS.md').replace('Workflow', 'Hacked'));

    expect((await setupProject(options(root), deps)).upToDate).toBe(true);
    const forced = await setupProject(options(root, { force: true }), deps);
    expect(forced.updated).toContain('AGENTS.md');
    expect(readFile(root, 'AGENTS.md')).not.toContain('Hacked');
  });
});

describe('setupProject: safety', () => {
  it('never writes through a link that leaves the project', async () => {
    const outside = fs.mkdtempSync(path.join(os.tmpdir(), 'codemaps-outside-'));
    const root = tempProject();
    try {
      if (!tryLink(outside, path.join(root, '.claude'))) return;
      const result = await setupProject(options(root), { createBaseline: fakeBaseline().create });
      expect(fs.readdirSync(outside)).toEqual([]);
      expect(result.status).toBe('partial');
      expect(result.skipped.map((entry) => entry.path)).toEqual(
        expect.arrayContaining([
          '.claude/settings.json',
          '.claude/skills/codemaps-agent-autopilot/SKILL.md',
        ])
      );
      expect(result.warnings.join(' ')).toContain('symbolic link');
      expect(exists(root, 'AGENTS.md')).toBe(true);
    } finally {
      fs.rmSync(outside, { recursive: true, force: true });
    }
  });
});

describe('setupProject: real baseline', () => {
  it('freezes the legacy findings of a project so it starts green', async () => {
    const project = new TestProject();
    try {
      project.write('src/legacy.ts', functionOfLines('longLegacy', 80));
      const result = await setupProject(options(project.root), {
        createBaseline: async () => createProjectBaseline(project.graph()),
      });
      expect(result.baseline.status).toBe('created');
      expect(result.baseline.byKind).toMatchObject({ long_function: 1 });
      const stored = JSON.parse(readFile(project.root, '.codemaps/baseline.json'));
      expect(Object.keys(stored.entries)).toContain('long_function|src/legacy.ts|longLegacy');
    } finally {
      project.dispose();
    }
  });
});
