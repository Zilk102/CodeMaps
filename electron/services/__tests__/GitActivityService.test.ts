import { spawnSync } from 'child_process';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { GitActivityService } from '../GitActivityService';
import { PRImpactAnalyzer } from '../PRImpactAnalyzer';

vi.mock('electron-log/main', () => ({
  default: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

vi.mock('../KuzuGraphService', () => ({
  KuzuGraphService: class {
    async init() {}
    async close() {}
    async queryNodes() {
      return [];
    }
  },
}));

const git = (cwd: string, args: string[]) => {
  const result = spawnSync('git', args, { cwd, encoding: 'utf-8' });
  if (result.status !== 0) {
    throw new Error(`git ${args.join(' ')} failed: ${result.stderr}`);
  }
  return result.stdout;
};

let repoDir: string;

beforeAll(async () => {
  repoDir = fs.mkdtempSync(path.join(os.tmpdir(), 'codemaps-churn-'));
  git(repoDir, ['init', '-q', '-b', 'main']);
  git(repoDir, ['config', 'user.email', 'author@example.com']);
  git(repoDir, ['config', 'user.name', 'Test Author']);

  fs.writeFileSync(path.join(repoDir, 'a.ts'), 'export const a = 1;\n');
  git(repoDir, ['add', '.']);
  git(repoDir, ['commit', '-q', '-m', 'first']);

  fs.writeFileSync(path.join(repoDir, 'a.ts'), 'export const a = 1;\nexport const b = 2;\n');
  fs.writeFileSync(path.join(repoDir, 'b.ts'), 'export const c = 3;\n');
  git(repoDir, ['add', '.']);
  git(repoDir, ['commit', '-q', '-m', 'second']);
});

afterAll(() => {
  fs.rmSync(repoDir, { recursive: true, force: true });
});

describe('GitActivityService.analyzeChurn', () => {
  it('reports per-file commit counts, line churn and authors', () => {
    const heatmap = new GitActivityService(repoDir).analyzeChurn();

    expect(heatmap.totalFiles).toBe(2);

    const fileA = heatmap.files.find((file) => file.filePath.endsWith('a.ts'));
    const fileB = heatmap.files.find((file) => file.filePath.endsWith('b.ts'));

    expect(fileA?.commits).toBe(2);
    expect(fileA?.additions).toBe(2);
    expect(fileB?.commits).toBe(1);

    // A malformed --format string used to leave authors holding the commit timestamp.
    expect(fileA?.authors).toEqual(['Test Author']);
    expect(fileA?.lastModified.getTime()).toBeGreaterThan(0);
    expect(heatmap.maxCommits).toBe(2);
  });

  it('returns an empty heatmap outside a git repository', () => {
    const emptyDir = fs.mkdtempSync(path.join(os.tmpdir(), 'codemaps-nogit-'));

    try {
      const heatmap = new GitActivityService(emptyDir).analyzeChurn();
      expect(heatmap.files).toEqual([]);
      expect(heatmap.totalFiles).toBe(0);
    } finally {
      fs.rmSync(emptyDir, { recursive: true, force: true });
    }
  });
});

describe('PRImpactAnalyzer branch validation', () => {
  it.each([
    'main; rm -rf /',
    '--upload-pack=touch /tmp/pwned',
    '$(whoami)',
    'a`id`',
    'feature branch',
  ])('rejects %s', async (branch) => {
    const analyzer = new PRImpactAnalyzer(repoDir);

    await expect(analyzer.analyzePR(branch, 'HEAD')).rejects.toThrow('Invalid branch name');
    await expect(analyzer.analyzePR('main', branch)).rejects.toThrow('Invalid branch name');
  });

  it('accepts ordinary revisions', async () => {
    const analyzer = new PRImpactAnalyzer(repoDir);

    const result = await analyzer.analyzePR('main', 'HEAD');
    expect(result.riskScore).toBe('low');
  });
});
