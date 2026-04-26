import { spawnSync } from 'child_process';
import * as path from 'path';
import { KuzuGraphService } from './KuzuGraphService';

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
    // Get git log with stats
    const sinceStr = since ? `--since="${since.toISOString()}"` : '';
    const untilStr = until ? `--until="${until.toISOString()}"` : '';
    
    const logOutput = this.execGit([
      'git', 'log',
      "'--format=COMMIT:%H|%an|%at'",
      '--numstat',
      sinceStr,
      untilStr,
      '--',
      '.'
    ]);

    const fileMap = new Map<string, FileChurn>();
    let currentCommit = '';
    let currentAuthor = '';
    let currentDate = new Date();
    const processedCommits = new Set<string>();

    for (const line of logOutput.split('\n')) {
      if (line.startsWith('COMMIT:')) {
        const [, hash, author, timestamp] = line.split('|');
        currentCommit = hash;
        currentAuthor = author;
        currentDate = new Date(parseInt(timestamp) * 1000);
        processedCommits.add(hash);
      } else if (line.trim() && !line.startsWith('COMMIT:')) {
        const [additions, deletions, filePath] = line.split('\t');
        
        if (!filePath || filePath.startsWith('COMMIT:')) continue;

        const absPath = path.resolve(this.projectPath, filePath);
        
        let churn = fileMap.get(absPath);
        if (!churn) {
          churn = {
            filePath: absPath,
            commits: 0,
            additions: 0,
            deletions: 0,
            lastModified: currentDate,
            authors: []
          };
          fileMap.set(absPath, churn);
        }

        // Count each commit only once per file
        if (!churn.authors.includes(currentCommit)) {
          churn.commits++;
          churn.authors.push(currentCommit);
        }
        
        churn.additions += parseInt(additions) || 0;
        churn.deletions += parseInt(deletions) || 0;
        
        if (currentDate > churn.lastModified) {
          churn.lastModified = currentDate;
        }

        if (!churn.authors.includes(currentAuthor)) {
          churn.authors.push(currentAuthor);
        }
      }
    }

    const files = Array.from(fileMap.values());
    
    // Clean up authors array (remove commit hashes, keep unique authors)
    files.forEach(f => {
      f.authors = [...new Set(f.authors.filter(a => !/^[a-f0-9]{40}$/i.test(a)))];
    });

    const maxCommits = Math.max(...files.map(f => f.commits), 1);
    const maxChanges = Math.max(...files.map(f => f.additions + f.deletions), 1);

    return {
      files: files.sort((a, b) => b.commits - a.commits),
      maxCommits,
      maxChanges,
      totalFiles: files.length,
      timeRange: {
        from: since || new Date(0),
        to: until || new Date()
      }
    };
  }

  private execGit(args: string[]): string {
    try {
      const result = spawnSync('git', args.filter(Boolean), {
        encoding: 'utf-8',
        cwd: this.projectPath,
        maxBuffer: 50 * 1024 * 1024,
      });
      if (result.error) throw result.error;
      return result.stdout || '';
    } catch (error: any) {
      console.error('Git command failed:', error.message);
      return '';
    }
  }

  async getNodeChurn(nodeId: string): Promise<FileChurn | null> {
    const nodes = await this.graphService.queryNodes(undefined, nodeId);
    if (nodes.length === 0) return null;
    
    const filePath = nodes[0]['n.filePath'];
    const heatmap = this.analyzeChurn();
    
    return heatmap.files.find(f => f.filePath === filePath) || null;
  }

  async close(): Promise<void> {
    await this.graphService.close();
  }
}
