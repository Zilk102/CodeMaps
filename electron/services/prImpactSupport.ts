export type PRRiskScore = 'low' | 'medium' | 'high' | 'critical';
export type ChangedFileStatus = 'added' | 'modified' | 'deleted';

export interface ChangedFile {
  path: string;
  status: ChangedFileStatus;
  additions: number;
  deletions: number;
}

/** Ascending thresholds checked from the most severe level down; any exceeded limit wins. */
const RISK_LEVELS: Array<{
  score: Exclude<PRRiskScore, 'low'>;
  changes: number;
  blastRadius: number;
  affectedNodes: number;
}> = [
  { score: 'critical', changes: 500, blastRadius: 50, affectedNodes: 20 },
  { score: 'high', changes: 200, blastRadius: 20, affectedNodes: 10 },
  { score: 'medium', changes: 50, blastRadius: 5, affectedNodes: 5 },
];

export function calculateRiskScore(
  changedFiles: ChangedFile[],
  affectedNodeCount: number,
  blastRadius: number
): PRRiskScore {
  const totalChanges = changedFiles.reduce((sum, f) => sum + f.additions + f.deletions, 0);
  const level = RISK_LEVELS.find(
    (candidate) =>
      totalChanges > candidate.changes ||
      blastRadius > candidate.blastRadius ||
      affectedNodeCount > candidate.affectedNodes
  );
  return level ? level.score : 'low';
}

export function describeDeletionRisk(filePath: string, dependentCount: number) {
  return `⚠️ Deleting ${filePath} affects ${dependentCount} dependent nodes. Consider refactoring instead.`;
}

/** Recommendations that depend only on the overall size and test coverage of the change set. */
export function buildSummaryRecommendations(changedFiles: ChangedFile[], affectedCount: number) {
  const recommendations: string[] = [];

  if (affectedCount > 10) {
    recommendations.push(
      `📊 Large impact: ${affectedCount} nodes affected. Consider breaking into smaller PRs.`
    );
  }

  if (changedFiles.some((f) => f.path.includes('test'))) {
    recommendations.push('✅ Tests updated — good practice!');
  } else if (affectedCount > 0) {
    recommendations.push('💡 Consider adding tests for the affected nodes.');
  }

  return recommendations;
}

/** Parses `git diff --numstat` output; the status of each file is resolved by the caller. */
export function parseNumstat(
  output: string,
  statusOf: (filePath: string) => ChangedFileStatus
): ChangedFile[] {
  return output
    .trim()
    .split('\n')
    .filter((line) => line.trim())
    .map((line) => {
      const [additions, deletions, filePath] = line.split('\t');
      return {
        path: filePath,
        status: statusOf(filePath),
        additions: parseInt(additions) || 0,
        deletions: parseInt(deletions) || 0,
      };
    });
}
