import { KuzuGraphService } from './KuzuGraphService';
import { GitService } from './GitService';
import { COMMIT_PREFIX, GitChurnAccumulator } from './gitChurnParser';

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
  private gitService: GitService;
  private projectPath: string;

  constructor(projectPath: string) {
    this.projectPath = projectPath;
    this.graphService = new KuzuGraphService(projectPath);
    this.gitService = new GitService(projectPath);
  }

  async init(): Promise<void> {
    await this.graphService.init();
  }

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
