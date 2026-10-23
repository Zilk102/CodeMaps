// Shared by the self-report scripts: every JS/TS source file under the given files or folders.
import * as fs from 'node:fs';
import * as path from 'node:path';

const SOURCE = /\.(?:[cm]?[jt]sx?)$/;
const SKIPPED_DIRS = new Set(['node_modules', 'dist-electron', 'dist-renderer', '.git', 'release']);

export const collectSourceFiles = (target) => {
  const stat = fs.statSync(target);
  if (stat.isFile()) return SOURCE.test(target) ? [target] : [];
  return fs
    .readdirSync(target, { withFileTypes: true })
    .filter((entry) => !SKIPPED_DIRS.has(entry.name))
    .flatMap((entry) => collectSourceFiles(path.join(target, entry.name)));
};

/** The files of every target, or exits with a usage message when none is given. */
export const sourceFilesOfArguments = (scriptName, args) => {
  if (args.length === 0) {
    console.error(`usage: node scripts/${scriptName} <file-or-folder>...`);
    process.exit(2);
  }
  return args.flatMap((target) => collectSourceFiles(path.resolve(target)));
};
