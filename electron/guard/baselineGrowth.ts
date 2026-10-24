/**
 * The "baseline may only shrink" rule. A baseline records accepted debt; if a pull request could
 * add entries or raise recorded measures, the ratchet would be a rubber stamp. Comparing the
 * working baseline with the base ref's copy makes that visible in CI.
 */
import { BASELINE_FILE_NAME, parseBaseline } from '../analysis/baseline/baselineFile';
import { readBaseline } from '../analysis/baseline';
import { CODEMAPS_DIRECTORY } from '../analysis/projectConfig/projectPaths';
import type { Baseline } from '../analysis/baseline/types';
import { fileAtRef } from './changedFiles';
import type { BaselineGrowth } from './types';

/** The entries of a baseline in a fixed order, so reports do not depend on file order. */
const sortedEntries = (baseline: Baseline): Array<[string, number]> =>
  Object.entries(baseline.entries).sort(([a], [b]) => a.localeCompare(b));

/**
 * How `current` differs from `previous`: entries that are new, and entries whose measure went up.
 * Without a previous baseline there is nothing to grow from (the file is being introduced), so
 * nothing counts as growth; without a current one nothing can have grown.
 */
export const compareBaselines = (
  previous: Baseline | null,
  current: Baseline | null
): BaselineGrowth => {
  const entries = previous && current ? sortedEntries(current) : [];
  const known = previous?.entries ?? {};
  const added = entries.filter(([fingerprint]) => known[fingerprint] === undefined);
  const raised = entries
    .filter(([fingerprint, to]) => known[fingerprint] !== undefined && to > known[fingerprint])
    .map(([fingerprint, to]) => ({ fingerprint, from: known[fingerprint], to }));
  return {
    grew: added.length + raised.length > 0,
    added: added.map(([fingerprint]) => fingerprint),
    raised,
  };
};

/** Compares the project's baseline file with the one committed at `base`. */
export const baselineGrowthSince = (root: string, base: string): BaselineGrowth => {
  const text = fileAtRef(root, base, `${CODEMAPS_DIRECTORY}/${BASELINE_FILE_NAME}`);
  return compareBaselines(text === null ? null : parseBaseline(text), readBaseline(root));
};
