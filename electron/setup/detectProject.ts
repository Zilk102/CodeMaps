/**
 * Best-effort detection of a project's languages, package manager, build/test/lint commands and
 * CI provider from the files in its root. It only reads small manifests and never runs anything;
 * what it cannot tell stays absent, and the generated guidance then simply omits it.
 */
import * as fs from 'fs';
import * as path from 'path';
import { detectNodeProject } from './detectNode';
import type { DetectedProject, Ecosystem, ProjectCommands } from './types';

const ECOSYSTEMS: Ecosystem[] = [
  {
    marker: 'go.mod',
    language: 'Go',
    packageManager: 'go',
    commands: { test: 'go test ./...', lint: 'go vet ./...', build: 'go build ./...' },
  },
  {
    marker: 'Cargo.toml',
    language: 'Rust',
    packageManager: 'cargo',
    commands: {
      test: 'cargo test',
      lint: 'cargo clippy',
      build: 'cargo build',
      format: 'cargo fmt',
    },
  },
  {
    marker: 'pom.xml',
    language: 'Java',
    packageManager: 'maven',
    commands: { test: 'mvn test', build: 'mvn package' },
  },
  {
    marker: /^build\.gradle(\.kts)?$/,
    language: 'Java/Kotlin',
    packageManager: 'gradle',
    commands: { test: './gradlew test', build: './gradlew build' },
  },
  {
    marker: /\.(sln|csproj)$/,
    language: 'C#',
    packageManager: 'dotnet',
    commands: { test: 'dotnet test', build: 'dotnet build' },
  },
  {
    marker: 'Gemfile',
    language: 'Ruby',
    packageManager: 'bundler',
    commands: { test: 'bundle exec rake test' },
  },
  {
    marker: 'composer.json',
    language: 'PHP',
    packageManager: 'composer',
    commands: { test: 'composer test' },
  },
  {
    marker: 'mix.exs',
    language: 'Elixir',
    packageManager: 'mix',
    commands: { test: 'mix test', format: 'mix format' },
  },
  {
    marker: 'Package.swift',
    language: 'Swift',
    packageManager: 'swiftpm',
    commands: { test: 'swift test', build: 'swift build' },
  },
  {
    marker: 'CMakeLists.txt',
    language: 'C/C++',
    packageManager: 'cmake',
    commands: { build: 'cmake --build build' },
  },
];

/** CI configuration files and the provider each one means. */
const CI_MARKERS: Array<[string, string]> = [
  ['.gitlab-ci.yml', 'gitlab-ci'],
  ['Jenkinsfile', 'jenkins'],
  ['.circleci/config.yml', 'circleci'],
  ['azure-pipelines.yml', 'azure-pipelines'],
  ['.travis.yml', 'travis'],
  ['bitbucket-pipelines.yml', 'bitbucket-pipelines'],
  ['.drone.yml', 'drone'],
];

const readText = (root: string, name: string): string => {
  try {
    return fs.readFileSync(path.join(root, name), 'utf-8');
  } catch {
    return '';
  }
};

const matches = (marker: string | RegExp, entries: string[]): boolean =>
  typeof marker === 'string' ? entries.includes(marker) : entries.some((name) => marker.test(name));

/** The Python packaging tool in use, from lockfiles and `pyproject.toml`; plain `pip` when nothing says otherwise. */
const pythonPackageManager = (entries: string[], pyproject: string): string => {
  if (entries.includes('uv.lock')) return 'uv';
  if (/[tool.poetry]/.test(pyproject)) return 'poetry';
  return entries.includes('Pipfile') ? 'pipenv' : 'pip';
};

/** Python has several manifests and a choice of tools, so it is read separately from the table. */
const detectPython = (root: string, entries: string[]): Ecosystem | null => {
  const manifests = ['pyproject.toml', 'requirements.txt', 'setup.py', 'setup.cfg', 'Pipfile'];
  if (!manifests.some((name) => entries.includes(name))) return null;
  const pyproject = readText(root, 'pyproject.toml');
  const manager = pythonPackageManager(entries, pyproject);
  const commands: ProjectCommands = { test: 'pytest' };
  if (/\bruff\b/.test(pyproject)) commands.lint = 'ruff check .';
  if (/\bmypy\b/.test(pyproject)) commands.typecheck = 'mypy .';
  if (/\bblack\b/.test(pyproject)) commands.format = 'black .';
  return { marker: 'pyproject.toml', language: 'Python', packageManager: manager, commands };
};

/** Targets of a Makefile that map to the usual commands; they fill gaps but never override manifests. */
const makefileCommands = (root: string, entries: string[]): ProjectCommands => {
  const name = entries.find((entry) => /^makefile$/i.test(entry));
  if (!name) return {};
  const text = readText(root, name);
  const has = (target: string) => new RegExp(`^${target}\\s*:`, 'm').test(text);
  const commands: ProjectCommands = {};
  if (has('test')) commands.test = 'make test';
  if (has('lint')) commands.lint = 'make lint';
  if (has('build')) commands.build = 'make build';
  return commands;
};

/** CI providers: GitHub Actions workflows plus the single-file providers. */
const detectCi = (root: string): string[] => {
  const providers: string[] = [];
  try {
    const workflows = fs.readdirSync(path.join(root, '.github', 'workflows'));
    if (workflows.some((name) => /\.ya?ml$/.test(name))) providers.push('github-actions');
  } catch {
    // No workflows folder: GitHub Actions is not in use.
  }
  for (const [file, provider] of CI_MARKERS) {
    if (fs.existsSync(path.join(root, file))) providers.push(provider);
  }
  return providers;
};

const listEntries = (root: string): string[] => {
  try {
    return fs.readdirSync(root);
  } catch {
    return [];
  }
};

/** Combines the commands of all ecosystems (the first one found wins a clash) and lets the Makefile fill only what is missing. */
const mergeCommands = (found: Ecosystem[], makefile: ProjectCommands): ProjectCommands => {
  const commands: ProjectCommands = {};
  for (const ecosystem of [...found].reverse()) Object.assign(commands, ecosystem.commands);
  return { ...makefile, ...commands };
};

/**
 * Looks at the project root and reports what it recognizes. JavaScript/TypeScript projects are
 * read in depth (`package.json` scripts, lockfile, tsconfig); other ecosystems come from their
 * manifest. The first ecosystem that sets a command wins; a Makefile only fills what is missing.
 */
export const detectProject = (root: string): DetectedProject => {
  const entries = listEntries(root);
  const found: Ecosystem[] = [];
  const node = detectNodeProject(root, entries);
  if (node) found.push(node);
  const python = detectPython(root, entries);
  if (python) found.push(python);
  for (const ecosystem of ECOSYSTEMS) {
    if (matches(ecosystem.marker, entries)) found.push(ecosystem);
  }

  const commands = mergeCommands(found, makefileCommands(root, entries));

  return {
    languages: [...new Set(found.map((ecosystem) => ecosystem.language))],
    packageManager: found[0]?.packageManager ?? null,
    commands,
    ci: detectCi(root),
  };
};
