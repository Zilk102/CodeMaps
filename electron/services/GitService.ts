/** Thin, safe wrapper for running read-only git commands in a project folder. */

import { spawnSync } from 'child_process';
import log from 'electron-log/main';

/** Runs git in `projectPath` through the system `git` executable. */
export class GitService {
  constructor(private readonly projectPath: string) {}

  /** Runs `git <args>` synchronously and returns stdout (up to 50 MB), or null when git is missing or exits with an error (logged as a warning). */
  execGit(args: string[]): string | null {
    const result = spawnSync('git', args, {
      encoding: 'utf-8',
      cwd: this.projectPath,
      maxBuffer: 50 * 1024 * 1024,
    });

    if (result.error || result.status !== 0) {
      log.warn('[GitService] git command failed:', args.join(' '), result.stderr?.trim());
      return null;
    }

    return result.stdout ?? '';
  }

  /** Whether `revision` is safe to pass to git as an argument: starts with a letter or digit (so it cannot be read as an option), uses only branch/tag/hash characters, and has no `..` range. */
  isSafeGitRevision(revision: string): boolean {
    return /^[A-Za-z0-9][A-Za-z0-9._/\-@^~]*$/.test(revision) && !revision.includes('..');
  }
}
