/**
 * The compact summary of old debt that tools show instead of listing every old finding.
 */
import { kindOfFingerprint } from './fingerprint';
import type {
  Baseline,
  Classification,
  CurrentFinding,
  KindCounts,
  LegacyDebtSummary,
} from './types';

const countByKind = (kinds: Iterable<string>): KindCounts => {
  const counts: Record<string, number> = {};
  for (const kind of kinds) counts[kind] = (counts[kind] ?? 0) + 1;
  return counts as KindCounts;
};

const kindsOf = (findings: CurrentFinding[]): string[] => findings.map((finding) => finding.kind);

/** How many of the findings there are of each kind. */
export const summarizeKinds = (findings: CurrentFinding[]): KindCounts =>
  countByKind(kindsOf(findings));

/**
 * Summarizes the old debt: the legacy findings still present (counted per kind), the baseline
 * entries that no longer exist (paid down), and how many baselined findings got worse. The
 * numbers are small and the old items are not listed.
 */
export const summarizeLegacyDebt = (
  baseline: Baseline,
  classification: Classification,
  current: CurrentFinding[]
): LegacyDebtSummary => {
  const present = new Set(current.map((finding) => finding.fingerprint));
  const gone = Object.keys(baseline.entries).filter((fingerprint) => !present.has(fingerprint));
  return {
    total: classification.legacy.length,
    byKind: countByKind(kindsOf(classification.legacy)),
    paidDown: { total: gone.length, byKind: countByKind(gone.map(kindOfFingerprint)) },
    worsened: classification.worsened.length,
    baselineCreatedAt: baseline.createdAt,
  };
};
