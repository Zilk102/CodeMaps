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

export interface PRImpactResult {
  changedFiles: ChangedFile[];
  affectedNodes: string[];
  blastRadius: number;
  riskScore: PRRiskScore;
  recommendations: string[];
}

export class PRImpactAnalyzer {
  private graphService: KuzuGraphService;
  private gitService: GitService;

  constructor(projectPath: string) {
    this.graphService = new KuzuGraphService(projectPath);
    this.gitService = new GitService(projectPath);
  }

  async init(): Promise<void> {
    await this.graphService.init();
  }

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

  private getChangedFiles(baseBranch: string, headBranch: string): ChangedFile[] {
    const output = this.gitService.execGit(['diff', '--numstat', `${baseBranch}...${headBranch}`]);
    if (output === null) {
      return [];
    }

    return parseNumstat(output, (filePath) => this.getFileStatus(filePath, baseBranch, headBranch));
  }

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

  async close(): Promise<void> {
    await this.graphService.close();
  }
}
