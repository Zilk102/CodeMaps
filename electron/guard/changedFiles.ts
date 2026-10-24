/**
 * Finds what a pull request changed with plain git, read-only: the files that differ from the
 * merge base with the base ref, plus untracked files, and the base ref's copy of a file. A shallow
 * CI checkout without the base ref cannot be judged, which is reported instead of guessed.
 */
import { GitService } from '../services/GitService';

/** A git failure the user can act on (unknown ref, shallow clone), with a ready-to-print message. */
export class GuardGitError extends Error {}

const lines = (text: string | null): string[] => (text ?? '').split(/\r?\n/).filter(Boolean);

/** The git helper for `root`, with the base ref checked to be a plain revision name. */
const gitFor = (root: string, base: string): GitService => {
  const git = new GitService(root);
  if (!git.isSafeGitRevision(base)) throw new GuardGitError(`"${base}" is not a valid git ref.`);
  if (git.execGit(['rev-parse', '--verify', '--quiet', `${base}^{commit}`]) === null) {
    throw new GuardGitError(
      `Cannot find "${base}". In CI fetch the full history (actions/checkout fetch-depth: 0) or fetch the base branch first.`
    );
  }
  return git;
};

/**
 * Project-relative paths (forward slashes) of files added or modified since `base` branched off,
 * counting uncommitted edits and untracked files. Deleted files are left out. Throws
 * `GuardGitError` for an unknown ref.
 */
export const changedFilesSince = (root: string, base: string): string[] => {
  const git = gitFor(root, base);
  // Without a merge base (unrelated histories) compare with the ref itself.
  const mergeBase = git.execGit(['merge-base', base, 'HEAD'])?.trim() || base;
  const tracked = git.execGit([
    'diff',
    '--name-only',
    '--relative',
    '--diff-filter=d',
    mergeBase,
    '--',
    '.',
  ]);
  const untracked = git.execGit(['ls-files', '--others', '--exclude-standard']);
  return [...new Set([...lines(tracked), ...lines(untracked)])].sort();
};

/** Text of `relativePath` (relative to `root`) at `base`, or null when the file did not exist there. */
export const fileAtRef = (root: string, base: string, relativePath: string): string | null =>
  gitFor(root, base).execGit(['show', `${base}:./${relativePath}`]);
