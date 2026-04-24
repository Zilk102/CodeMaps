import * as path from 'path';
import simpleGit from 'simple-git';
import { normalizePath } from './shared';

export class ChurnAnalyzer {
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
      console.warn('Git history extraction failed:', error);
    }

    return churnMap;
  }
}
