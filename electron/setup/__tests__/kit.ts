/**
 * Test kit for the setup tests: throwaway project directories on the real file system, a fake
 * baseline creator that counts its calls, and a helper that tries to create a symbolic link.
 */
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import type { BaselineCreation } from '../../analysis/baseline';
import type { BaselineCreator } from '../codemapsFiles';
import type { SetupOptions } from '../types';

const created: string[] = [];

/** Creates a temporary directory holding `files` (relative path to text); removed by `cleanTemp`. */
export const tempProject = (files: Record<string, string> = {}): string => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'codemaps-setup-')).replace(/\\/g, '/');
  created.push(root);
  for (const [relative, text] of Object.entries(files)) writeFile(root, relative, text);
  return root;
};

/** Writes a file below `root`, creating folders. */
export const writeFile = (root: string, relative: string, text: string): void => {
  const file = path.join(root, relative);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, text);
};

/** The text of a file below `root`. */
export const readFile = (root: string, relative: string): string =>
  fs.readFileSync(path.join(root, relative), 'utf-8');

/** Whether a file or folder exists below `root`. */
export const exists = (root: string, relative: string): boolean =>
  fs.existsSync(path.join(root, relative));

/** Every file below `root` as a sorted list of relative paths. */
export const listFiles = (root: string, folder = ''): string[] =>
  fs.readdirSync(path.join(root, folder), { withFileTypes: true }).flatMap((entry) => {
    const relative = folder ? `${folder}/${entry.name}` : entry.name;
    return entry.isDirectory() ? listFiles(root, relative) : [relative];
  });

/** Removes every directory made by `tempProject`. */
export const cleanTemp = (): void => {
  for (const root of created.splice(0))
    fs.rmSync(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 });
};

/** A baseline creator that records how often it was called and writes a tiny baseline file. */
export const fakeBaseline = (): { create: BaselineCreator; calls: string[] } => {
  const calls: string[] = [];
  const create: BaselineCreator = async (root) => {
    calls.push(root);
    const baseline = {
      version: 1 as const,
      createdAt: 'now',
      entries: { 'long_function|a.ts|f': 70 },
    };
    writeFile(root, '.codemaps/baseline.json', JSON.stringify(baseline));
    return {
      baseline,
      path: `${root}/.codemaps/baseline.json`,
      total: 1,
      byKind: { long_function: 1 },
    } as BaselineCreation;
  };
  return { create, calls };
};

/** Setup options for `root` with the defaults of the tool (apply, no force) and a claude client. */
export const options = (root: string, extra: Partial<SetupOptions> = {}): SetupOptions => ({
  root,
  version: '1.2.0',
  clientName: 'claude-code',
  apply: true,
  force: false,
  ...extra,
});

/** Creates a directory link (a junction on Windows, needing no privileges); false when impossible. */
export const tryLink = (target: string, link: string): boolean => {
  try {
    fs.mkdirSync(path.dirname(link), { recursive: true });
    fs.symlinkSync(target, link, 'junction');
    return true;
  } catch {
    return false;
  }
};
