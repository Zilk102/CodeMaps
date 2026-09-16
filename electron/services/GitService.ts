import { spawnSync } from 'child_process';
import log from 'electron-log/main';

export class GitService {
  constructor(private readonly projectPath: string) {}

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

  isSafeGitRevision(revision: string): boolean {
    return /^[A-Za-z0-9][A-Za-z0-9._/\-@^~]*$/.test(revision) && !revision.includes('..');
  }
}
