import { execSync } from 'child_process';
import * as path from 'path';
import { KuzuGraphService } from './KuzuGraphService';

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

  constructor(projectPath: string) {
    this.graphService = new KuzuGraphService(projectPath);
  }

  async init(): Promise<void> {
    await this.graphService.init();
  }

  async analyzePR(baseBranch: string = 'main', headBranch: string = 'HEAD'): Promise<PRImpactResult> {
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

    if (changedFiles.some(f => f.path.includes('test'))) {
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

  private getChangedFiles(baseBranch: string, headBranch: string): ChangedFile[] {
    try {
      const output = execSync(
        `git diff --numstat ${baseBranch}...${headBranch}`,
        { encoding: 'utf-8', cwd: this.graphService['dbPath'].replace('/.codemaps/graph.db', '') }
      );

      return output
        .trim()
        .split('\n')
        .filter(line => line.trim())
        .map(line => {
          const [additions, deletions, filePath] = line.split('\t');
          return {
            path: filePath,
            status: this.getFileStatus(filePath, baseBranch, headBranch),
            additions: parseInt(additions) || 0,
            deletions: parseInt(deletions) || 0,
          };
        });
    } catch (error) {
      console.error('Failed to get changed files:', error);
      return [];
    }
  }

  private getFileStatus(filePath: string, baseBranch: string, headBranch: string): 'added' | 'modified' | 'deleted' {
    try {
      const cwd = this.graphService['dbPath'].replace('/.codemaps/graph.db', '');
      
      // Check if file exists in base branch
      const existsInBase = execSync(
        `git ls-tree ${baseBranch} "${filePath}"`,
        { encoding: 'utf-8', cwd }
      ).trim();

      // Check if file exists in head branch
      const existsInHead = execSync(
        `git ls-tree ${headBranch} "${filePath}"`,
        { encoding: 'utf-8', cwd }
      ).trim();

      if (!existsInBase && existsInHead) return 'added';
      if (existsInBase && !existsInHead) return 'deleted';
      return 'modified';
    } catch {
      return 'modified';
    }
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
