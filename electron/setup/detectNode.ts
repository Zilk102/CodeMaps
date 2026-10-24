/**
 * Detection for JavaScript and TypeScript projects: the package manager (from the lockfile or the
 * `packageManager` field), whether TypeScript is used, and the project's own scripts mapped to the
 * test / lint / build / typecheck / format commands an agent should run.
 */
import * as fs from 'fs';
import * as path from 'path';
import type { Ecosystem, ProjectCommands } from './types';

interface PackageJson {
  scripts?: Record<string, unknown>;
  packageManager?: unknown;
  dependencies?: Record<string, unknown>;
  devDependencies?: Record<string, unknown>;
}

/** Lockfile name to the package manager that writes it, in priority order. */
const LOCKFILES: Array<[string, string]> = [
  ['pnpm-lock.yaml', 'pnpm'],
  ['yarn.lock', 'yarn'],
  ['bun.lockb', 'bun'],
  ['bun.lock', 'bun'],
  ['package-lock.json', 'npm'],
];

/** Script names that stand for each command, first match wins. */
const SCRIPT_ALIASES: Record<keyof ProjectCommands, string[]> = {
  test: ['test'],
  lint: ['lint'],
  build: ['build'],
  typecheck: ['typecheck', 'type-check', 'tsc'],
  format: ['format', 'prettier'],
};

const readPackageJson = (root: string): PackageJson | null => {
  try {
    const parsed: unknown = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf-8'));
    return typeof parsed === 'object' && parsed !== null ? (parsed as PackageJson) : null;
  } catch {
    return null;
  }
};

const detectPackageManager = (pkg: PackageJson, entries: string[]): string => {
  const declared = typeof pkg.packageManager === 'string' ? pkg.packageManager.split('@')[0] : '';
  if (declared) return declared;
  return LOCKFILES.find(([file]) => entries.includes(file))?.[1] ?? 'npm';
};

/** How to run the script `name` with `manager`: `npm test`, `yarn lint`, `pnpm build`, `bun run x`. */
const runScript = (manager: string, name: string): string => {
  if (manager === 'npm') return name === 'test' ? 'npm test' : `npm run ${name}`;
  return manager === 'bun' ? `bun run ${name}` : `${manager} ${name}`;
};

/** The placeholder `npm init` writes; it fails on purpose, so it is not a real test command. */
const isPlaceholderTest = (script: unknown): boolean =>
  typeof script === 'string' && script.includes('no test specified');

/** Maps the project's own scripts to the standard commands, skipping the failing placeholder `npm init` writes. */
const commandsFromScripts = (pkg: PackageJson, manager: string): ProjectCommands => {
  const scripts = pkg.scripts ?? {};
  const commands: ProjectCommands = {};
  for (const [key, aliases] of Object.entries(SCRIPT_ALIASES)) {
    const name = aliases.find(
      (alias) => typeof scripts[alias] === 'string' && !isPlaceholderTest(scripts[alias])
    );
    if (name) commands[key as keyof ProjectCommands] = runScript(manager, name);
  }
  return commands;
};

const usesTypeScript = (pkg: PackageJson, entries: string[]): boolean =>
  entries.includes('tsconfig.json') ||
  'typescript' in (pkg.devDependencies ?? {}) ||
  'typescript' in (pkg.dependencies ?? {});

/**
 * The JavaScript/TypeScript ecosystem of the project, or null when there is no readable
 * `package.json`. Commands come only from scripts the project defines itself.
 */
export const detectNodeProject = (root: string, entries: string[]): Ecosystem | null => {
  if (!entries.includes('package.json')) return null;
  const pkg = readPackageJson(root) ?? {};
  const manager = detectPackageManager(pkg, entries);
  return {
    marker: 'package.json',
    language: usesTypeScript(pkg, entries) ? 'TypeScript' : 'JavaScript',
    packageManager: manager,
    commands: commandsFromScripts(pkg, manager),
  };
};
