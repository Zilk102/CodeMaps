import { describe, expect, it } from 'vitest';
import { buildHealthScoreResult } from '../healthScorePolicies';
import type { HealthScoreMetricSnapshot } from '../healthScoreTypes';

const healthy: HealthScoreMetricSnapshot = {
  totalNodes: 10,
  totalLinks: 10,
  fileNodes: 5,
  symbolNodes: 5,
  orphanNodes: 0,
  unresolvedImportLinks: 0,
  directoryCoverageRatio: 1,
  architectureViolations: 0,
  unknownLayerNodes: 0,
  stackAwareLinks: 0,
  diRuntimeLinks: 0,
  contractSemanticLinks: 0,
  oversizedModules: 0,
  godFiles: 0,
  godClasses: 0,
  longMethods: 0,
  complexMethods: 0,
  codeClones: 0,
  mixedResponsibilityModules: 0,
  avgDesignSmellScore: 0,
  maintainabilityScore: 100,
  solidScore: 100,
  watcherFlushes: 0,
  watcherBatchedEvents: 0,
  watcherCoalescedFlushes: 0,
  skippedRefreshes: 0,
  runtimePriorityRebuilds: 0,
  avgRefreshLatencyMs: 0,
  refreshSkipRate: 0,
  runtimePriorityRate: 0,
  refreshLatencyTrend: 'stable',
  refreshPipelineDegraded: false,
};

describe('buildHealthScoreResult', () => {
  it('gives a clean snapshot a perfect score and no issues', () => {
    const result = buildHealthScoreResult(healthy);
    expect(result.score).toBe(100);
    expect(result.grade).toBe('A');
    expect(result.issues).toEqual([]);
  });

  it('keeps issue order and applies penalties, including the hidden design-debt penalty', () => {
    const result = buildHealthScoreResult({
      ...healthy,
      unresolvedImportLinks: 30,
      godFiles: 1,
      maintainabilityScore: 50,
    });
    expect(result.issues.map((issue) => issue.code)).toEqual([
      'unresolved_import_links',
      'god_files',
      'maintainability_score',
    ]);
    expect(result.issues[0].severity).toBe('high');
    // 100 - 25 (imports) - 3 (god file design debt)
    expect(result.score).toBe(72);
  });

  it('clamps the score at zero', () => {
    const result = buildHealthScoreResult({
      ...healthy,
      totalNodes: 0,
      fileNodes: 0,
      godFiles: 9,
      unresolvedImportLinks: 25,
    });
    expect(result.score).toBe(0);
    expect(result.grade).toBe('F');
  });
});
