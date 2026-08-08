import { spawnSync } from 'child_process';
import log from 'electron-log/main';
import * as path from 'path';
import { KuzuGraphService } from './KuzuGraphService';

const COMMIT_PREFIX = 'COMMIT:';

export interface FileChurn {
  filePath: string;
  commits: number;
  additions: number;
  deletions: number;
  lastModified: Date;
  authors: string[];
}

export interface HeatmapData {
  files: FileChurn[];
  maxCommits: number;
  maxChanges: number;
  totalFiles: number;
  timeRange: { from: Date; to: Date };
}

export class GitActivityService {
  private graphService: KuzuGraphService;
  private projectPath: string;

  constructor(projectPath: string) {
    this.projectPath = projectPath;
    this.graphService = new KuzuGraphService(projectPath);
  }

  async init(): Promise<void> {
    await this.graphService.init();
  }

  analyzeChurn(since?: Date, until?: Date): HeatmapData {
    const logOutput = this.execGit([
      'log',
      `--format=${COMMIT_PREFIX}%H|%an|%at`,
      '--numstat',
      ...(since ? [`--since=${since.toISOString()}`] : []),
      ...(until ? [`--until=${until.toISOString()}`] : []),
      '--',
      '.',
    ]);

    const fileMap = new Map<string, FileChurn>();
    const commitsPerFile = new Map<string, Set<string>>();
    let currentCommit = '';
    let currentAuthor = '';
    let currentDate = new Date();

    for (const line of logOutput.split('\n')) {
      if (line.startsWith(COMMIT_PREFIX)) {
        const [hash, author, timestamp] = line.slice(COMMIT_PREFIX.length).split('|');
        currentCommit = hash;
        currentAuthor = author;
        const seconds = parseInt(timestamp, 10);
        currentDate = Number.isNaN(seconds) ? new Date(0) : new Date(seconds * 1000);
      } else if (line.trim()) {
        const [additions, deletions, filePath] = line.split('\t');

        if (!filePath) continue;

        const absPath = path.resolve(this.projectPath, filePath);

        let churn = fileMap.get(absPath);
        if (!churn) {
          churn = {
            filePath: absPath,
            commits: 0,
            additions: 0,
            deletions: 0,
            lastModified: currentDate,
            authors: [],
          };
          fileMap.set(absPath, churn);
          commitsPerFile.set(absPath, new Set());
        }

        const seenCommits = commitsPerFile.get(absPath)!;
        if (!seenCommits.has(currentCommit)) {
          seenCommits.add(currentCommit);
          churn.commits++;
        }

        churn.additions += parseInt(additions, 10) || 0;
        churn.deletions += parseInt(deletions, 10) || 0;

        if (currentDate > churn.lastModified) {
          churn.lastModified = currentDate;
        }

        if (currentAuthor && !churn.authors.includes(currentAuthor)) {
          churn.authors.push(currentAuthor);
        }
      }
    }

    const files = Array.from(fileMap.values());
    const maxCommits = Math.max(...files.map((f) => f.commits), 1);
    const maxChanges = Math.max(...files.map((f) => f.additions + f.deletions), 1);

    return {
      files: files.sort((a, b) => b.commits - a.commits),
      maxCommits,
      maxChanges,
      totalFiles: files.length,
      timeRange: {
        from: since || new Date(0),
        to: until || new Date(),
      },
    };
  }

  private execGit(args: string[]): string {
    const result = spawnSync('git', args, {
      encoding: 'utf-8',
      cwd: this.projectPath,
      maxBuffer: 50 * 1024 * 1024,
    });

    if (result.error || result.status !== 0) {
      log.warn('[Heatmap] git command failed:', args.join(' '), result.stderr?.trim());
      return '';
    }

    return result.stdout || '';
  }

  async getNodeChurn(nodeId: string): Promise<FileChurn | null> {
    const nodes = await this.graphService.queryNodes(undefined, nodeId);
    if (nodes.length === 0) return null;

    const filePath = nodes[0]['n.filePath'];
    const heatmap = this.analyzeChurn();

    return heatmap.files.find((f) => f.filePath === filePath) || null;
  }

  async close(): Promise<void> {
    await this.graphService.close();
  }
}
