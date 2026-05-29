export interface HealthScoreIssue {
  code: string;
  severity: 'high' | 'medium' | 'low';
  message: string;
}

export interface HealthScoreSummary {
  totalNodes: number;
  totalLinks: number;
  fileNodes: number;
  symbolNodes: number;
  orphanNodes: number;
  unresolvedImportLinks: number;
  directoryCoverageRatio: number;
  architectureViolations: number;
  unknownLayerNodes: number;
  stackAwareLinks: number;
  diRuntimeLinks: number;
  contractSemanticLinks: number;
  oversizedModules: number;
  godFiles: number;
  godClasses: number;
  longMethods: number;
  complexMethods: number;
  mixedResponsibilityModules: number;
  avgDesignSmellScore: number;
  maintainabilityScore: number;
  solidScore: number;
  watcherFlushes: number;
  watcherBatchedEvents: number;
  watcherCoalescedFlushes: number;
  skippedRefreshes: number;
  runtimePriorityRebuilds: number;
  avgRefreshLatencyMs: number;
  refreshSkipRate: number;
  runtimePriorityRate: number;
  refreshLatencyTrend: 'stable' | 'improving' | 'degrading';
  refreshPipelineDegraded: boolean;
}

export interface HealthScoreResult {
  score: number;
  grade: 'A' | 'B' | 'C' | 'D' | 'F';
  summary: HealthScoreSummary;
  issues: HealthScoreIssue[];
}

export type HealthScoreMetricSnapshot = HealthScoreSummary;
