/**
 * Test kit of the guard tests: throwaway git repositories with small TypeScript projects, helpers
 * to commit and edit them, and a captured command line runner.
 */
import { spawnSync } from 'child_process';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { runCli } from '../commands';

const created: string[] = [];

/** Runs git in `root` with a fixed identity; throws with git's message when it fails. */
export const git = (root: string, ...args: string[]): string => {
  const result = spawnSync(
    'git',
    ['-c', 'user.email=guard@test.local', '-c', 'user.name=guard', ...args],
    { cwd: root, encoding: 'utf-8' }
  );
  if (result.status !== 0) throw new Error(`git ${args.join(' ')}: ${result.stderr}`);
  return result.stdout;
};

/** Writes a file below `root`, creating folders. */
export const write = (root: string, relative: string, text: string): void => {
  const file = path.join(root, relative);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, text);
};

/** Creates a git repository on branch `main` holding `files` in a first commit. */
export const tempRepo = (files: Record<string, string>): string => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'codemaps-guard-')).replace(/\\/g, '/');
  created.push(root);
  git(root, 'init', '-q', '-b', 'main');
  for (const [relative, text] of Object.entries(files)) write(root, relative, text);
  commitAll(root, 'initial');
  return root;
};

/** Stages and commits everything. */
export const commitAll = (root: string, message: string): void => {
  git(root, 'add', '-A');
  git(root, 'commit', '-q', '-m', message);
};

/** Removes every repository made by `tempRepo`. */
export const cleanRepos = (): void => {
  for (const root of created.splice(0)) fs.rmSync(root, { recursive: true, force: true });
};

/** A small, fully documented module that no rule objects to. */
export const CLEAN_MODULE = `/** Greeting helpers of the fixture project. */

/** Greets someone; the contract is a non-empty string for every name. */
export const greet = (name: string): string => \`Hello, \${name}\`;
`;

/** A TypeScript module with one function of `lines` statements, which is long for small limits. */
export const longModule = (lines: number): string => {
  const body = Array.from(
    { length: lines },
    (_, index) => `  total += values[${index % 7}] * ${index};`
  );
  return `/** Long function of the fixture project. */

/** Adds up a lot of products; only its length matters here. */
export function compute(values: number[]): number {
  let total = 0;
${body.join('\n')}
  return total;
}
`;
};

/** Config that makes 60 lines the limit and silences the documentation rules. */
export const STRICT_SIZE_CONFIG = JSON.stringify({
  version: 1,
  thresholds: { maxFunctionLines: 60, maxComplexity: 8, maxNesting: 3 },
  documentation: { enabled: false },
});

/** Runs the command line with `argv` and captures what it prints. */
export const runGuard = async (
  argv: string[]
): Promise<{ code: number; out: string; err: string }> => {
  let out = '';
  let err = '';
  const code = await runCli(argv, {
    out: (text) => (out += text),
    err: (text) => (err += text),
  });
  return { code, out, err };
};
