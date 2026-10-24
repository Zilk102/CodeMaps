/**
 * Ratchet mode for change validation: reduces what the detectors found to the findings that are
 * new or worse than the baseline.
 *
 * The detectors report whole patterns ("the 10 worst long methods"), which hides new problems
 * behind old ones. The ratchet therefore rebuilds the baselined patterns from the individual
 * fresh and worsened findings, so a new 70-line function is reported even when ten old ones are
 * longer, and an old one that was left alone is not reported at all.
 */
import type { DocumentationReport } from '../documentation';
import type { DetectedPattern } from '../patternDetectionTypes';
import { classifyFindings, reportable } from './classify';
import { summarizeLegacyDebt } from './legacyDebt';
import { undocumentedSymbolKey } from './documentationFindings';
import type {
  Baseline,
  Classification,
  CurrentFinding,
  FindingKind,
  LegacyDebtSummary,
} from './types';

/** What validation needs to apply the baseline: the fresh and worsened findings and the debt summary. */
export interface RatchetContext {
  classification: Classification;
  /** Fresh plus worsened findings: the ones that count. */
  newFindings: CurrentFinding[];
  legacyDebt: LegacyDebtSummary;
}

/** Which detector pattern reports each finding kind; documentation kinds have their own finding. */
const PATTERN_OF_KIND: Partial<Record<FindingKind, string>> = {
  long_function: 'long_methods',
  complex_function: 'complex_methods',
  deep_function: 'complex_methods',
  god_class: 'god_classes',
  god_file: 'god_files',
  oversized_module: 'oversized_modules',
  mixed_responsibility: 'mixed_responsibility_modules',
  high_fan_out: 'high_fan_out_files',
  clone: 'code_clones',
  layer_violation: 'layer_violations',
};

const COVERED_PATTERNS = new Set(Object.values(PATTERN_OF_KIND));
// The detector calls layer violations high only when there are many of them.
const MANY_LAYER_VIOLATIONS = 10;

/** Classifies the current findings against the baseline and summarizes the old debt. */
export const buildRatchetContext = (
  baseline: Baseline,
  current: CurrentFinding[]
): RatchetContext => {
  const classification = classifyFindings(current, baseline);
  return {
    classification,
    newFindings: reportable(classification),
    legacyDebt: summarizeLegacyDebt(baseline, classification, current),
  };
};

const SEVERITY_RANK = { low: 0, medium: 1, high: 2 } as const;

/** The severity of a rebuilt pattern: the worst of its findings, with the layer rule on counts. */
const severityOfGroup = (
  patternId: string,
  findings: CurrentFinding[]
): DetectedPattern['severity'] => {
  if (patternId === 'layer_violations') {
    return findings.length > MANY_LAYER_VIOLATIONS ? 'high' : 'medium';
  }
  return findings.reduce<DetectedPattern['severity']>(
    (worst, finding) =>
      SEVERITY_RANK[finding.severity] > SEVERITY_RANK[worst] ? finding.severity : worst,
    'low'
  );
};

/** Groups findings by the pattern that reports them. */
const groupByPattern = (findings: CurrentFinding[]): Map<string, CurrentFinding[]> => {
  const groups = new Map<string, CurrentFinding[]>();
  for (const finding of findings) {
    const id = PATTERN_OF_KIND[finding.kind];
    if (id) groups.set(id, [...(groups.get(id) ?? []), finding]);
  }
  return groups;
};

/**
 * Replaces the baselined patterns by patterns made of the fresh and worsened findings only.
 * Patterns the baseline does not cover (hubs, churn, runtime wiring, ...) pass through unchanged,
 * and a baselined pattern with no fresh finding disappears.
 */
export const applyRatchetToPatterns = (
  patterns: DetectedPattern[],
  ratchet: RatchetContext
): DetectedPattern[] => {
  const originals = new Map(patterns.map((pattern) => [pattern.id, pattern]));
  const rebuilt: DetectedPattern[] = [];
  for (const [id, findings] of groupByPattern(ratchet.newFindings)) {
    const original = originals.get(id);
    if (!original) continue;
    rebuilt.push({
      ...original,
      severity: severityOfGroup(id, findings),
      nodeIds: [
        ...new Set(
          findings.flatMap((item) => [item.path, ...(item.relatedPath ? [item.relatedPath] : [])])
        ),
      ],
      evidence: findings.map((item) => ({ nodeId: item.path, message: item.message })),
    });
  }
  return [...patterns.filter((pattern) => !COVERED_PATTERNS.has(pattern.id)), ...rebuilt];
};

/**
 * The documentation report reduced to the undocumented symbols and header-less files that are
 * new. Offenders keep their place only when they still have a new gap, with the new gaps counted.
 */
export const applyRatchetToDocumentation = (
  report: DocumentationReport | null,
  ratchet: RatchetContext
): DocumentationReport | null => {
  if (!report) return null;
  const freshSymbols = new Set<string>();
  const freshHeaders = new Set<string>();
  for (const finding of ratchet.newFindings) {
    if (finding.kind === 'undocumented_symbol')
      freshSymbols.add(`${finding.path}|${finding.symbol}`);
    if (finding.kind === 'missing_header') freshHeaders.add(finding.path);
  }
  const undocumented = report.undocumented.filter((symbol) =>
    freshSymbols.has(`${symbol.file}|${undocumentedSymbolKey(symbol.kind, symbol.name)}`)
  );
  const newGaps = new Map<string, number>();
  for (const symbol of undocumented) newGaps.set(symbol.file, (newGaps.get(symbol.file) ?? 0) + 1);
  return {
    ...report,
    undocumented,
    filesWithoutHeader: report.filesWithoutHeader.filter((file) => freshHeaders.has(file)),
    topOffenders: report.topOffenders
      .filter((offender) => newGaps.has(offender.file))
      .map((offender) => ({ ...offender, missing: newGaps.get(offender.file) ?? 0 })),
  };
};
