/** Types of the project health score: its issues, metric summary and result. */
import type { LegacyDebtSummary } from './baseline/types';

/** One problem found by the health check, with a stable code, a severity and an explanation. */
export interface HealthScoreIssue {
  code: string;
  severity: 'high' | 'medium' | 'low';
  message: string;
}

/**
 * The measurements behind the score: graph size, link quality, architecture, code quality, scores
 * and refresh pipeline telemetry.
 */
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
  codeClones: number;
  /** Percent of the symbols that need a doc comment and have one; 100 when not measured yet. */
  documentationCoveragePercent: number;
  undocumentedSymbols: number;
  filesWithoutHeader: number;
  lowQualityDocs: number;
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
  /** Old debt a project baseline accepts; present only in ratchet mode with a baseline. The score ignores it. */
  legacyDebt?: LegacyDebtSummary;
  /** Problems found in `.codemaps/config.json`; present only when there are any. */
  configWarnings?: string[];
}

/**
 * The health outcome: a 0-100 score, a letter grade (A at 90 and above, F below 60), the metrics
 * and the issues found.
 */
export interface HealthScoreResult {
  score: number;
  grade: 'A' | 'B' | 'C' | 'D' | 'F';
  summary: HealthScoreSummary;
  issues: HealthScoreIssue[];
}

/** The measured values the scoring rules read: the summary without the project-settings notes. */
export type HealthScoreMetricSnapshot = Omit<HealthScoreSummary, 'legacyDebt' | 'configWarnings'>;
