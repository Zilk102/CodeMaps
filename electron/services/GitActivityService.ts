/** Per-file change activity from git history (commits, lines changed, authors) for the churn heatmap. */

import { KuzuGraphService } from './KuzuGraphService';
import { GitService } from './GitService';
import { COMMIT_PREFIX, GitChurnAccumulator } from './gitChurnParser';

/** Activity of one file within the analysed period: number of commits, lines added and deleted, last change and distinct authors. */
export interface FileChurn {
  filePath: string;
  commits: number;
  additions: number;
  deletions: number;
  lastModified: Date;
  authors: string[];
}

/** Churn of all files sorted by commit count, with the maxima used to scale a heatmap and the period covered. */
export interface HeatmapData {
  files: FileChurn[];
  maxCommits: number;
  maxChanges: number;
  totalFiles: number;
  timeRange: { from: Date; to: Date };
}

/** Reads `git log` for a project and turns it into churn figures. */
export class GitActivityService {
  private graphService: KuzuGraphService;
  private gitService: GitService;
  private projectPath: string;

  constructor(projectPath: string) {
    this.projectPath = projectPath;
    this.graphService = new KuzuGraphService(projectPath);
    this.gitService = new GitService(projectPath);
  }

  /** Opens the graph database used to map nodes to files. */
  async init(): Promise<void> {
    await this.graphService.init();
  }

  /** Churn for every file touched in the optional `since`..`until` range, most-changed first. Without git history the list is empty; `timeRange` defaults to the epoch..now. */
  analyzeChurn(since?: Date, until?: Date): HeatmapData {
    const logOutput =
      this.gitService.execGit([
        'log',
        `--format=${COMMIT_PREFIX}%H|%an|%at`,
        '--numstat',
        ...(since ? [`--since=${since.toISOString()}`] : []),
        ...(until ? [`--until=${until.toISOString()}`] : []),
        '--',
        '.',
      ]) || '';

    const accumulator = new GitChurnAccumulator(this.projectPath);
    for (const line of logOutput.split('\n')) {
      accumulator.addLine(line);
    }

    const files: FileChurn[] = accumulator.result();
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

  /** Churn of the file that owns the graph node found for `nodeId`, over the whole history. Null when no such node or no activity is found. */
  async getNodeChurn(nodeId: string): Promise<FileChurn | null> {
    const nodes = await this.graphService.queryNodes(undefined, nodeId);
    if (nodes.length === 0) return null;

    const filePath = nodes[0]['n.filePath'];
    const heatmap = this.analyzeChurn();

    return heatmap.files.find((f) => f.filePath === filePath) || null;
  }

  /** Closes the graph database. */
  async close(): Promise<void> {
    await this.graphService.close();
  }
}
