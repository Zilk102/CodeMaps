import { afterEach, describe, expect, it } from 'vitest';
import { agentFromClientName, detectAgents } from '../detectAgents';
import { detectProject } from '../detectProject';
import { cleanTemp, tempProject } from './kit';

afterEach(cleanTemp);

describe('detectProject', () => {
  it('reads a TypeScript project with yarn from package.json scripts', () => {
    const root = tempProject({
      'package.json': JSON.stringify({
        scripts: { test: 'vitest run', lint: 'eslint .', build: 'tsc', typecheck: 'tsc --noEmit' },
        devDependencies: { typescript: '^5' },
      }),
      'yarn.lock': '',
      '.github/workflows/ci.yml': 'name: ci',
    });
    expect(detectProject(root)).toEqual({
      languages: ['TypeScript'],
      packageManager: 'yarn',
      commands: {
        test: 'yarn test',
        lint: 'yarn lint',
        build: 'yarn build',
        typecheck: 'yarn typecheck',
      },
      ci: ['github-actions'],
    });
  });

  it('ignores the placeholder test script of npm init and defaults to npm', () => {
    const root = tempProject({
      'package.json': JSON.stringify({
        scripts: { test: 'echo "Error: no test specified" && exit 1', build: 'webpack' },
      }),
    });
    const detected = detectProject(root);
    expect(detected.languages).toEqual(['JavaScript']);
    expect(detected.packageManager).toBe('npm');
    expect(detected.commands).toEqual({ build: 'npm run build' });
  });

  it('detects Python with poetry and ruff', () => {
    const root = tempProject({
      'pyproject.toml': '[tool.poetry]\nname="x"\n[tool.ruff]\nline-length=100\n',
      '.gitlab-ci.yml': 'stages: []',
    });
    const detected = detectProject(root);
    expect(detected.languages).toEqual(['Python']);
    expect(detected.packageManager).toBe('poetry');
    expect(detected.commands).toMatchObject({ test: 'pytest', lint: 'ruff check .' });
    expect(detected.ci).toEqual(['gitlab-ci']);
  });

  it.each([
    ['go.mod', 'Go', 'go test ./...'],
    ['Cargo.toml', 'Rust', 'cargo test'],
    ['pom.xml', 'Java', 'mvn test'],
    ['build.gradle.kts', 'Java/Kotlin', './gradlew test'],
    ['App.csproj', 'C#', 'dotnet test'],
  ])('detects %s as %s', (file, language, test) => {
    const detected = detectProject(tempProject({ [file]: '' }));
    expect(detected.languages).toEqual([language]);
    expect(detected.commands.test).toBe(test);
  });

  it('lets a Makefile fill gaps without overriding manifest commands', () => {
    const root = tempProject({
      'go.mod': 'module x',
      Makefile: 'test:\n\tgo test\nlint:\n\tgolangci-lint run\n',
    });
    expect(detectProject(root).commands).toMatchObject({
      test: 'go test ./...',
      lint: 'go vet ./...',
    });
    const onlyMake = detectProject(tempProject({ Makefile: 'lint:\n\techo\n' }));
    expect(onlyMake.commands).toEqual({ lint: 'make lint' });
  });

  it('reports an empty project as unknown', () => {
    expect(detectProject(tempProject())).toEqual({
      languages: [],
      packageManager: null,
      commands: {},
      ci: [],
    });
  });
});

describe('agentFromClientName', () => {
  it.each([
    ['claude-code', 'claude'],
    ['Cursor', 'cursor'],
    ['codex-mcp-client', 'codex'],
    ['visual-studio-code', 'copilot'],
    ['Visual Studio Code', 'copilot'],
    ['vscode', 'copilot'],
    ['gemini-cli', 'gemini'],
    ['windsurf', 'windsurf'],
    ['cline', 'cline'],
    ['some-unknown-client', null],
    [undefined, null],
  ])('maps %s to %s', (name, agent) => {
    expect(agentFromClientName(name)).toBe(agent);
  });
});

describe('detectAgents', () => {
  it('combines the agents already in the project with the calling client', () => {
    const root = tempProject({
      '.cursor/rules/a.mdc': '',
      'GEMINI.md': '',
      '.github/copilot-instructions.md': '',
    });
    const agents = detectAgents(root, 'claude-code');
    expect(agents.fromProject).toEqual(['cursor', 'copilot', 'gemini']);
    expect(agents.fromClient).toBe('claude');
    expect(agents.selected).toEqual(['claude', 'cursor', 'copilot', 'gemini']);
  });

  it('selects nothing extra for an unknown client in an empty project', () => {
    expect(detectAgents(tempProject(), 'mystery').selected).toEqual([]);
  });

  it('lets an explicit list win over detection', () => {
    const root = tempProject({ 'CLAUDE.md': '' });
    expect(detectAgents(root, 'claude-code', ['windsurf', 'cline']).selected).toEqual([
      'windsurf',
      'cline',
    ]);
  });
});
