import { spawnSync } from 'child_process';
import log from 'electron-log/main';
import { KuzuGraphService } from './KuzuGraphService';

// Rejects anything git could mistake for an option and the characters that make a
// revision ambiguous, so untrusted branch names from MCP/IPC stay plain arguments.
const isSafeGitRevision = (revision: string) =>
  /^[A-Za-z0-9][A-Za-z0-9._/\-@^~]*$/.test(revision) && !revision.includes('..');

export interface PRImpactResult {
  changedFiles: ChangedFile[];
  affectedNodes: string[];
  blastRadius: number;
  riskScore: 'low' | 'medium' | 'high' | 'critical';
  recommendations: string[];
}

export interface ChangedFile {
  path: string;
  status: 'added' | 'modified' | 'deleted';
  additions: number;
  deletions: number;
}

export class PRImpactAnalyzer {
  private graphService: KuzuGraphService;
  private projectPath: string;

  constructor(projectPath: string) {
    this.projectPath = projectPath;
    this.graphService = new KuzuGraphService(projectPath);
  }

  async init(): Promise<void> {
    await this.graphService.init();
  }

  async analyzePR(
    baseBranch: string = 'main',
    headBranch: string = 'HEAD'
  ): Promise<PRImpactResult> {
    if (!isSafeGitRevision(baseBranch) || !isSafeGitRevision(headBranch)) {
      throw new Error('Invalid branch name');
    }

    const changedFiles = this.getChangedFiles(baseBranch, headBranch);

    if (changedFiles.length === 0) {
      return {
        changedFiles: [],
        affectedNodes: [],
        blastRadius: 0,
        riskScore: 'low',
        recommendations: ['No changes detected'],
      };
    }

    const affectedNodes: string[] = [];
    const recommendations: string[] = [];
    let totalBlastRadius = 0;

    for (const file of changedFiles) {
      // Find nodes matching this file path
      const nodes = await this.graphService.queryNodes(undefined, file.path);

      for (const node of nodes) {
        const nodeId = node['n.id'];
        if (!affectedNodes.includes(nodeId)) {
          affectedNodes.push(nodeId);
        }

        // Calculate blast radius for this node
        const neighbors = await this.graphService.queryNeighbors(nodeId);
        totalBlastRadius += neighbors.length;

        // Add recommendations based on change type
        if (file.status === 'deleted' && neighbors.length > 5) {
          recommendations.push(
            `⚠️ Deleting ${file.path} affects ${neighbors.length} dependent nodes. Consider refactoring instead.`
          );
        }
      }
    }

    // Calculate risk score
    const riskScore = this.calculateRiskScore(changedFiles, affectedNodes, totalBlastRadius);

    // Add general recommendations
    if (affectedNodes.length > 10) {
      recommendations.push(
        `📊 Large impact: ${affectedNodes.length} nodes affected. Consider breaking into smaller PRs.`
      );
    }

    if (changedFiles.some((f) => f.path.includes('test'))) {
      recommendations.push('✅ Tests updated — good practice!');
    } else if (affectedNodes.length > 0) {
      recommendations.push('💡 Consider adding tests for the affected nodes.');
    }

    return {
      changedFiles,
      affectedNodes,
      blastRadius: totalBlastRadius,
      riskScore,
      recommendations,
    };
  }

  private execGit(args: string[]): string | null {
    const result = spawnSync('git', args, {
      encoding: 'utf-8',
      cwd: this.projectPath,
      maxBuffer: 50 * 1024 * 1024,
    });

    if (result.error || result.status !== 0) {
      log.warn('[PRImpact] git command failed:', args.join(' '), result.stderr?.trim());
      return null;
    }

    return result.stdout ?? '';
  }

  private getChangedFiles(baseBranch: string, headBranch: string): ChangedFile[] {
    const output = this.execGit(['diff', '--numstat', `${baseBranch}...${headBranch}`]);
    if (output === null) {
      return [];
    }

    return output
      .trim()
      .split('\n')
      .filter((line) => line.trim())
      .map((line) => {
        const [additions, deletions, filePath] = line.split('\t');
        return {
          path: filePath,
          status: this.getFileStatus(filePath, baseBranch, headBranch),
          additions: parseInt(additions) || 0,
          deletions: parseInt(deletions) || 0,
        };
      });
  }

  private getFileStatus(
    filePath: string,
    baseBranch: string,
    headBranch: string
  ): 'added' | 'modified' | 'deleted' {
    const existsInBase = this.execGit(['ls-tree', baseBranch, '--', filePath])?.trim();
    const existsInHead = this.execGit(['ls-tree', headBranch, '--', filePath])?.trim();

    if (!existsInBase && existsInHead) return 'added';
    if (existsInBase && !existsInHead) return 'deleted';
    return 'modified';
  }

  private calculateRiskScore(
    changedFiles: ChangedFile[],
    affectedNodes: string[],
    blastRadius: number
  ): 'low' | 'medium' | 'high' | 'critical' {
    const totalChanges = changedFiles.reduce((sum, f) => sum + f.additions + f.deletions, 0);

    if (totalChanges > 500 || blastRadius > 50 || affectedNodes.length > 20) {
      return 'critical';
    }
    if (totalChanges > 200 || blastRadius > 20 || affectedNodes.length > 10) {
      return 'high';
    }
    if (totalChanges > 50 || blastRadius > 5 || affectedNodes.length > 5) {
      return 'medium';
    }
    return 'low';
  }

  async close(): Promise<void> {
    await this.graphService.close();
  }
}
