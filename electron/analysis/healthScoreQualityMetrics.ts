/**
 * Code quality, documentation and architecture metrics for the health score, reduced from the
 * module quality and architecture analyses.
 */

import { ArchitectureInsightService } from './ArchitectureInsightService';
import { type DocumentationIndex } from './documentation';
import { analyzeModuleQuality } from './moduleQualityMetrics';
import { calculateMaintainabilityScore, calculateSolidScore } from './healthScorePolicies';
import type { HealthScoreMetricSnapshot } from './healthScoreTypes';

type Architecture = ReturnType<ArchitectureInsightService['analyze']>;
type ModuleQuality = ReturnType<typeof analyzeModuleQuality>;

/** Counts of the module quality findings that feed the health score. */
export interface QualityCounts {
  oversizedModules: number;
  godFiles: number;
  godClasses: number;
  longMethods: number;
  complexMethods: number;
  codeClones: number;
  mixedResponsibilityModules: number;
  avgDesignSmellScore: number;
}

function sumMatches<T>(items: T[], pick: (item: T) => unknown[]): number {
  return items.reduce((count, item) => count + pick(item).length, 0);
}

/**
 * Reduces module quality findings to counts, taking the number of matched classes or methods for
 * class and method findings, and the average design smell score over all modules.
 */
export function summarizeQuality(quality: ModuleQuality): QualityCounts {
  return {
    oversizedModules: quality.oversizedModules.length,
    godFiles: quality.godFiles.length,
    godClasses: sumMatches(quality.godClasses, (metric) => metric.matchedClasses),
    longMethods: sumMatches(quality.longMethods, (metric) => metric.matchedMethods),
    complexMethods: sumMatches(quality.complexMethods, (metric) => metric.matchedMethods),
    codeClones: quality.codeClones ? quality.codeClones.length : 0,
    mixedResponsibilityModules: quality.mixedResponsibilityModules.length,
    avgDesignSmellScore:
      quality.metrics.length === 0
        ? 0
        : quality.metrics.reduce((sum, metric) => sum + metric.designSmellScore, 0) /
          quality.metrics.length,
  };
}

/** The documentation facts of the health score, taken from the snapshot type so the two never drift apart. */
export type DocumentationMetrics = Pick<
  HealthScoreMetricSnapshot,
  'documentationCoveragePercent' | 'undocumentedSymbols' | 'filesWithoutHeader' | 'lowQualityDocs'
>;

/** Documentation facts from the last report of the project; a project not measured yet reads as fully documented so nothing is penalized on missing data. */
export function buildDocumentationMetrics(
  documentation: Pick<DocumentationIndex, 'peek'>,
  projectRoot: string | undefined
): DocumentationMetrics {
  const report = documentation.peek(projectRoot);
  return {
    documentationCoveragePercent: report?.coveragePercent ?? 100,
    undocumentedSymbols: report?.undocumented.length ?? 0,
    filesWithoutHeader: report?.filesWithoutHeader.length ?? 0,
    lowQualityDocs: report?.lowQuality.length ?? 0,
  };
}

/**
 * Combines violation and unknown layer counts from the architecture analysis with the
 * maintainability and SOLID scores computed from the quality counts.
 */
export function buildArchitectureMetrics(
  architecture: Architecture,
  counts: QualityCounts,
  fileCount: number,
  documentationCoveragePercent: number
) {
  const architectureViolations = architecture.summary.violationCount;
  return {
    architectureViolations,
    unknownLayerNodes: architecture.summary.unknownNodes,
    maintainabilityScore: calculateMaintainabilityScore({
      avgDesignSmellScore: counts.avgDesignSmellScore,
      longMethods: counts.longMethods,
      complexMethods: counts.complexMethods,
      oversizedModules: counts.oversizedModules,
      godFiles: counts.godFiles,
      fileNodes: fileCount,
      codeClones: counts.codeClones,
      documentationCoveragePercent,
    }),
    solidScore: calculateSolidScore({
      godFiles: counts.godFiles,
      godClasses: counts.godClasses,
      mixedResponsibilityModules: counts.mixedResponsibilityModules,
      architectureViolations,
      avgDesignSmellScore: counts.avgDesignSmellScore,
    }),
  };
}
