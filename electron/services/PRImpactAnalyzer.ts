/** Estimates the architectural impact of a branch or pull request from its changed files and the graph database. */

import { KuzuGraphService } from './KuzuGraphService';
import { GitService } from './GitService';
import {
  buildSummaryRecommendations,
  calculateRiskScore,
  ChangedFile,
  ChangedFileStatus,
  describeDeletionRisk,
  parseNumstat,
  PRRiskScore,
} from './prImpactSupport';

export type { ChangedFile } from './prImpactSupport';

/** Outcome of a PR analysis: the changed files, the graph nodes they touch, the summed neighbour count, a risk level and advice. */
export interface PRImpactResult {
  changedFiles: ChangedFile[];
  affectedNodes: string[];
  blastRadius: number;
  riskScore: PRRiskScore;
  recommendations: string[];
}

/** Combines `git diff` between two revisions with graph lookups in the Kuzu database. */
export class PRImpactAnalyzer {
  private graphService: KuzuGraphService;
  private gitService: GitService;

  constructor(projectPath: string) {
    this.graphService = new KuzuGraphService(projectPath);
    this.gitService = new GitService(projectPath);
  }

  /** Opens the graph database. */
  async init(): Promise<void> {
    await this.graphService.init();
  }

  /** Analyzes the changes between `baseBranch` and `headBranch` (three-dot diff). Throws "Invalid branch name" for revision names that are unsafe to pass to git; no changes gives a low-risk empty result. */
  async analyzePR(
    baseBranch: string = 'main',
    headBranch: string = 'HEAD'
  ): Promise<PRImpactResult> {
    if (
      !this.gitService.isSafeGitRevision(baseBranch) ||
      !this.gitService.isSafeGitRevision(headBranch)
    ) {
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

    const { affectedNodes, totalBlastRadius, recommendations } =
      await this.collectGraphImpact(changedFiles);

    return {
      changedFiles,
      affectedNodes,
      blastRadius: totalBlastRadius,
      riskScore: calculateRiskScore(changedFiles, affectedNodes.length, totalBlastRadius),
      recommendations: [
        ...recommendations,
        ...buildSummaryRecommendations(changedFiles, affectedNodes.length),
      ],
    };
  }

  /** For each changed file, finds its nodes in the database and counts their neighbours; deleted files with more than five dependent nodes produce a warning. */
  private async collectGraphImpact(changedFiles: ChangedFile[]) {
    const affectedNodes: string[] = [];
    const recommendations: string[] = [];
    let totalBlastRadius = 0;

    for (const file of changedFiles) {
      const nodes = await this.graphService.queryNodes(undefined, file.path);

      for (const node of nodes) {
        const nodeId = node['n.id'];
        if (!affectedNodes.includes(nodeId)) {
          affectedNodes.push(nodeId);
        }

        const neighbors = await this.graphService.queryNeighbors(nodeId);
        totalBlastRadius += neighbors.length;

        if (file.status === 'deleted' && neighbors.length > 5) {
          recommendations.push(describeDeletionRisk(file.path, neighbors.length));
        }
      }
    }

    return { affectedNodes, totalBlastRadius, recommendations };
  }

  /** Files that differ between the two revisions with their line counts and status. Empty if git fails. */
  private getChangedFiles(baseBranch: string, headBranch: string): ChangedFile[] {
    const output = this.gitService.execGit(['diff', '--numstat', `${baseBranch}...${headBranch}`]);
    if (output === null) {
      return [];
    }

    return parseNumstat(output, (filePath) => this.getFileStatus(filePath, baseBranch, headBranch));
  }

  /** Classifies a file as added, deleted or modified by checking whether it exists in each revision. */
  private getFileStatus(
    filePath: string,
    baseBranch: string,
    headBranch: string
  ): ChangedFileStatus {
    const existsInBase = this.gitService.execGit(['ls-tree', baseBranch, '--', filePath])?.trim();
    const existsInHead = this.gitService.execGit(['ls-tree', headBranch, '--', filePath])?.trim();

    if (!existsInBase && existsInHead) return 'added';
    if (existsInBase && !existsInHead) return 'deleted';
    return 'modified';
  }

  /** Closes the graph database. */
  async close(): Promise<void> {
    await this.graphService.close();
  }
}
