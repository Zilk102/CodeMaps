/** Counts how often git history touched each file, as the change-frequency signal for the graph. */

import log from 'electron-log/main';
import * as path from 'path';
import simpleGit from 'simple-git';
import { normalizePath } from './shared';

/** Derives per-file churn (number of commits touching the file) from git history. */
export class ChurnAnalyzer {
  /** Maps the normalized absolute path of every file that ever appeared in history to its commit count. Empty when `baseDir` is not a git repository or history cannot be read (logged). */
  async analyze(baseDir: string) {
    const git = simpleGit(baseDir);
    const isRepo = await git.checkIsRepo();
    const churnMap = new Map<string, number>();

    if (!isRepo) {
      return churnMap;
    }

    try {
      const raw = await git.raw(['log', '--name-only', '--pretty=format:']);
      raw
        .split('\n')
        .filter(Boolean)
        .forEach((relativePath) => {
          const absolutePath = normalizePath(path.join(baseDir, relativePath));
          churnMap.set(absolutePath, (churnMap.get(absolutePath) || 0) + 1);
        });
    } catch (error) {
      log.warn('Git history extraction failed:', error);
    }

    return churnMap;
  }
}
