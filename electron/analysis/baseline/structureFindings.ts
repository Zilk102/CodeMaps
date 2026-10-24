/**
 * Baseline findings about size and shape: long, complex and deep functions, god classes, god files,
 * oversized modules and modules that mix responsibilities. They are read from the full list of
 * file metrics, not from the top-10 rankings, so a baseline covers every old finding.
 */
import { isGodFile, isOversizedModule, type ModuleQualityMetric } from '../moduleQualityMetrics';
import {
  describeClassEvidence,
  describeMethodEvidence,
  isSevereClass,
  isSevereLongFunction,
  isSevereMixedResponsibility,
  isSevereOversizedModule,
} from '../patternDetectionQuality';
import { DEFAULT_STRUCTURE_LIMITS, type StructureLimits } from '../projectConfig/structureLimits';
import type { SourceFunctionMetric } from '../sourceFileStructure';
import type { FindingDraft, FindingKind } from './types';

const severityOf = (isHigh: boolean): FindingDraft['severity'] => (isHigh ? 'high' : 'medium');

/** A draft for one function-level finding. */
const functionDraft = (
  metric: ModuleQualityMetric,
  fn: SourceFunctionMetric,
  kind: FindingKind,
  measure: number,
  isHigh: boolean
): FindingDraft => ({
  kind,
  path: metric.node.id,
  symbol: fn.name,
  line: fn.startLine,
  measure,
  severity: severityOf(isHigh),
  message: describeMethodEvidence(metric.node.label, fn),
});

/** Long, complex and deep functions of a file, judged by the project's limits. */
const functionDrafts = (metric: ModuleQualityMetric, limits: StructureLimits): FindingDraft[] => {
  const { longMethods, complexMethods } = metric.sourceMetrics;
  return [
    ...longMethods.map((fn) =>
      functionDraft(metric, fn, 'long_function', fn.lineCount, isSevereLongFunction(fn, limits))
    ),
    ...complexMethods
      .filter((fn) => fn.complexity >= limits.complexMinComplexity)
      .map((fn) =>
        functionDraft(
          metric,
          fn,
          'complex_function',
          fn.complexity,
          fn.complexity >= limits.severeComplexity
        )
      ),
    ...complexMethods
      .filter((fn) => fn.maxNesting >= limits.deepMinNesting)
      .map((fn) =>
        functionDraft(
          metric,
          fn,
          'deep_function',
          fn.maxNesting,
          fn.maxNesting >= limits.severeNesting
        )
      ),
  ];
};

/** God classes of a file; the measure is the class length in lines. */
const classDrafts = (metric: ModuleQualityMetric): FindingDraft[] =>
  metric.sourceMetrics.godClasses.map((cls) => ({
    kind: 'god_class',
    path: metric.node.id,
    symbol: cls.name,
    line: cls.startLine,
    measure: cls.lineCount,
    severity: severityOf(isSevereClass(cls)),
    message: describeClassEvidence(metric.node.label, cls),
  }));

/** The size a file-level finding is measured by: its lines, or its symbols when it is unreadable. */
const sizeOf = (metric: ModuleQualityMetric): number => metric.lineCount || metric.symbolCount * 20;

/** Whole-file findings: god file, oversized module, mixed responsibilities. */
const fileDrafts = (metric: ModuleQualityMetric): FindingDraft[] => {
  const base = { path: metric.node.id, symbol: '', line: 0 };
  const describe = `${metric.node.label}: ${metric.lineCount || 0} LOC, ${metric.symbolCount} symbols, smell score ${metric.designSmellScore}, axes ${metric.responsibilityAxisCount}.`;
  const drafts: FindingDraft[] = [];
  if (isGodFile(metric)) {
    drafts.push({
      ...base,
      kind: 'god_file',
      measure: sizeOf(metric),
      severity: 'high',
      message: describe,
    });
  }
  if (isOversizedModule(metric)) {
    drafts.push({
      ...base,
      kind: 'oversized_module',
      measure: sizeOf(metric),
      severity: severityOf(isSevereOversizedModule(metric)),
      message: describe,
    });
  }
  if (metric.mixedResponsibilities) {
    drafts.push({
      ...base,
      kind: 'mixed_responsibility',
      measure: metric.responsibilityAxisCount,
      severity: severityOf(isSevereMixedResponsibility(metric)),
      message: describe,
    });
  }
  return drafts;
};

/**
 * Drafts for every size and shape finding of the files `include` accepts, measured under the
 * given limits (the built-in ones when omitted).
 */
export const collectStructureFindings = (
  metrics: ModuleQualityMetric[],
  include: (path: string) => boolean,
  limits: StructureLimits = DEFAULT_STRUCTURE_LIMITS
): FindingDraft[] =>
  metrics
    .filter((metric) => include(metric.node.id))
    .flatMap((metric) => [
      ...functionDrafts(metric, limits),
      ...classDrafts(metric),
      ...fileDrafts(metric),
    ]);
