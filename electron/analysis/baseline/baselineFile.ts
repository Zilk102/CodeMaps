/**
 * Reads, writes and shrinks `<project>/.codemaps/baseline.json`.
 *
 * The file is meant to be committed: it is sorted and indented, so a pull request that pays down
 * debt shows up as a short diff of removed lines. Reading never throws; a missing or damaged file
 * reads as "no baseline", which makes every finding count (strict behavior), the safe default.
 */
import * as fs from 'fs';
import * as path from 'path';
import { codemapsFilePath } from '../projectConfig/projectPaths';
import type { Baseline, CurrentFinding } from './types';

/** Name of the baseline file inside `.codemaps`. */
export const BASELINE_FILE_NAME = 'baseline.json';

/** Absolute path of the baseline file of a project, whether it exists or not. */
export const baselinePath = (root: string): string => codemapsFilePath(root, BASELINE_FILE_NAME);

const isMeasureMap = (value: unknown): value is Record<string, number> =>
  typeof value === 'object' &&
  value !== null &&
  !Array.isArray(value) &&
  Object.values(value).every((measure) => typeof measure === 'number');

/** The baseline of a project, or null when there is none or the file is not a valid baseline. */
export const readBaseline = (root: string | undefined): Baseline | null => {
  if (!root) return null;
  try {
    const parsed: unknown = JSON.parse(fs.readFileSync(baselinePath(root), 'utf-8'));
    const candidate = parsed as Partial<Baseline> | null;
    if (!candidate || !isMeasureMap(candidate.entries)) return null;
    return {
      version: 1,
      createdAt: typeof candidate.createdAt === 'string' ? candidate.createdAt : '',
      entries: candidate.entries,
    };
  } catch {
    return null;
  }
};

/** Writes the baseline with sorted keys, so the file diffs cleanly in version control. */
export const writeBaseline = (root: string, baseline: Baseline): string => {
  const file = baselinePath(root);
  const entries = Object.fromEntries(
    Object.entries(baseline.entries).sort(([a], [b]) => a.localeCompare(b))
  );
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, `${JSON.stringify({ ...baseline, entries }, null, 2)}\n`, 'utf-8');
  return file;
};

/** A baseline that remembers every given finding with its current measure. */
export const baselineFromFindings = (findings: CurrentFinding[], now = new Date()): Baseline => ({
  version: 1,
  createdAt: now.toISOString(),
  entries: Object.fromEntries(findings.map((finding) => [finding.fingerprint, finding.measure])),
});

/** What `shrinkBaseline` did: entries dropped, measures lowered, entries left. */
export interface ShrinkResult {
  removed: number;
  tightened: number;
  remaining: number;
}

/**
 * Lets the baseline follow the code downward and never upward. An entry whose finding is gone is
 * dropped; an entry whose finding improved gets the better measure; a worsened finding keeps its
 * old measure (it stays flagged until fixed); a finding that is not in the baseline is never
 * added. Does nothing without a baseline file.
 */
export const shrinkBaseline = (root: string, currentFindings: CurrentFinding[]): ShrinkResult => {
  const baseline = readBaseline(root);
  if (!baseline) return { removed: 0, tightened: 0, remaining: 0 };

  const current = new Map(currentFindings.map((finding) => [finding.fingerprint, finding.measure]));
  const entries: Record<string, number> = {};
  let tightened = 0;
  for (const [fingerprint, recorded] of Object.entries(baseline.entries)) {
    const measure = current.get(fingerprint);
    if (measure === undefined) continue;
    entries[fingerprint] = Math.min(recorded, measure);
    if (measure < recorded) tightened += 1;
  }
  const remaining = Object.keys(entries).length;
  const removed = Object.keys(baseline.entries).length - remaining;
  if (removed > 0 || tightened > 0) writeBaseline(root, { ...baseline, entries });
  return { removed, tightened, remaining };
};
