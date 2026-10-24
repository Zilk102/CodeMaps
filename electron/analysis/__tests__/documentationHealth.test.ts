import { describe, expect, it } from 'vitest';
import { HealthScoreAnalyzer } from '../HealthScoreAnalyzer';
import {
  buildHealthScoreResult,
  calculateDocumentationPenalty,
  calculateMaintainabilityScore,
} from '../healthScorePolicies';
import type { HealthScoreMetricSnapshot } from '../healthScoreTypes';
import type { GraphData } from '../../store/types';
import { docFile, reportOf, symbol } from './documentationFixtures';

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
  documentationCoveragePercent: 100,
  undocumentedSymbols: 0,
  filesWithoutHeader: 0,
  lowQualityDocs: 0,
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

describe('calculateDocumentationPenalty', () => {
  it.each([
    [100, 0],
    [80, 0],
    [79.9, 1],
    [70, 1],
    [60, 2],
    [40, 4],
    [0, 5],
  ])('costs %s%% coverage %s point(s)', (coverage, penalty) => {
    expect(calculateDocumentationPenalty(coverage)).toBe(penalty);
  });
});

describe('documentation in the health score', () => {
  it('keeps the score unchanged from the target coverage up', () => {
    expect(buildHealthScoreResult({ ...healthy, documentationCoveragePercent: 80 }).score).toBe(
      100
    );
  });

  it('reports documentation_gaps and subtracts the bounded penalty below the target', () => {
    const result = buildHealthScoreResult({
      ...healthy,
      documentationCoveragePercent: 45,
      undocumentedSymbols: 30,
      filesWithoutHeader: 4,
    });
    expect(result.score).toBe(96);
    const issue = result.issues.find((entry) => entry.code === 'documentation_gaps');
    expect(issue).toMatchObject({ severity: 'medium' });
    expect(issue?.message).toContain('30');
  });

  it.each([
    [75, 'low'],
    [55, 'medium'],
    [20, 'high'],
  ])('rates %s%% coverage as %s severity', (coverage, severity) => {
    const result = buildHealthScoreResult({ ...healthy, documentationCoveragePercent: coverage });
    expect(result.issues[0]).toMatchObject({ code: 'documentation_gaps', severity });
  });

  it('never costs more than five points', () => {
    expect(buildHealthScoreResult({ ...healthy, documentationCoveragePercent: 0 }).score).toBe(95);
  });

  it('lowers the maintainability score only below the target', () => {
    const base = {
      avgDesignSmellScore: 0,
      longMethods: 0,
      complexMethods: 0,
      oversizedModules: 0,
      godFiles: 0,
      fileNodes: 5,
    };
    expect(calculateMaintainabilityScore({ ...base, documentationCoveragePercent: 90 })).toBe(100);
    expect(calculateMaintainabilityScore({ ...base })).toBe(100);
    expect(calculateMaintainabilityScore({ ...base, documentationCoveragePercent: 30 })).toBe(95);
  });
});

describe('HealthScoreAnalyzer documentation metrics', () => {
  const graph: GraphData = {
    nodes: [{ id: '/p/a.ts', type: 'file', name: 'a.ts', filePath: '/p/a.ts' }],
    links: [],
    projectRoot: '/p',
  } as unknown as GraphData;

  it('reads the last documentation report of the project', () => {
    const report = reportOf(
      docFile('/p/a.ts', [symbol('one', true), symbol('two', false), symbol('three', false)], {
        header: 'missing',
      })
    );
    const analyzer = new HealthScoreAnalyzer(undefined, { peek: () => report });
    const { summary, issues } = analyzer.analyze(graph);
    expect(summary).toMatchObject({
      documentationCoveragePercent: 33.3,
      undocumentedSymbols: 2,
      filesWithoutHeader: 1,
      lowQualityDocs: 0,
    });
    expect(issues.map((issue) => issue.code)).toContain('documentation_gaps');
  });

  it('does not penalize a project that was not measured yet', () => {
    const analyzer = new HealthScoreAnalyzer(undefined, { peek: () => null });
    const { summary, issues } = analyzer.analyze(graph);
    expect(summary.documentationCoveragePercent).toBe(100);
    expect(issues.map((issue) => issue.code)).not.toContain('documentation_gaps');
  });
});
