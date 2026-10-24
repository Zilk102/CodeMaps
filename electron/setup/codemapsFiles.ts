/**
 * The three project-state files `setup_project` owns inside `.codemaps/`: the default
 * `config.json`, the legacy `baseline.json` and the `setup.json` record of what was written.
 * Config and baseline are created once and never overwritten afterwards, because people edit the
 * first and the second must only ever shrink.
 */
import * as fs from 'fs';
import { kindOfFingerprint, readBaseline, type BaselineCreation } from '../analysis/baseline';
import { defaultProjectConfigText, loadProjectConfig } from '../analysis/projectConfig';
import type { ApplyEnvironment } from './applyFile';
import {
  readTextIfExists,
  resolveInsideRoot,
  UnsafePathError,
  writeTextAtomic,
} from './projectFiles';
import type { AgentId, BaselineSummary, FileOutcome } from './types';

/** Path of the project config, relative to the root. */
export const CONFIG_PATH = '.codemaps/config.json';
/** Path of the legacy baseline, relative to the root. */
export const BASELINE_PATH = '.codemaps/baseline.json';
/** Path of the record of what setup wrote, relative to the root. */
export const SETUP_RECORD_PATH = '.codemaps/setup.json';

/** Measures the project and writes its baseline; loads the project first when it is not open. */
export type BaselineCreator = (root: string) => Promise<BaselineCreation>;

const skippedProblem = (path: string, error: unknown): FileOutcome => ({
  path,
  action: 'skipped',
  reason: error instanceof Error ? error.message : String(error),
  problem: true,
});

/** Creates `.codemaps/config.json` with the default ratchet settings when it does not exist. */
export const configStep = (env: ApplyEnvironment): FileOutcome => {
  try {
    const file = resolveInsideRoot(env.root, CONFIG_PATH);
    if (fs.existsSync(file)) return { path: CONFIG_PATH, action: 'unchanged' };
    if (env.apply) writeTextAtomic(file, defaultProjectConfigText());
    return { path: CONFIG_PATH, action: 'created' };
  } catch (error) {
    if (!(error instanceof UnsafePathError)) throw error;
    return skippedProblem(CONFIG_PATH, error);
  }
};

/** The number of frozen findings per kind of an existing baseline. */
const countsOfBaseline = (root: string): { total: number; byKind: Record<string, number> } => {
  const entries = Object.keys(readBaseline(root)?.entries ?? {});
  const byKind: Record<string, number> = {};
  for (const fingerprint of entries) {
    const kind = kindOfFingerprint(fingerprint);
    byKind[kind] = (byKind[kind] ?? 0) + 1;
  }
  return { total: entries.length, byKind };
};

/**
 * Creates the baseline when the project has none, so a legacy codebase starts green: every
 * existing finding is frozen and only new or worsened ones are reported. Existing baselines are
 * left alone, strict projects need none, and a failure (for example a project that cannot be
 * indexed) is reported instead of thrown so the other files are still written.
 */
export const baselineStep = async (
  env: ApplyEnvironment,
  createBaseline: BaselineCreator
): Promise<{ summary: BaselineSummary; created: boolean }> => {
  const summary = (partial: Omit<BaselineSummary, 'path'>): BaselineSummary => ({
    path: BASELINE_PATH,
    ...partial,
  });
  try {
    const file = resolveInsideRoot(env.root, BASELINE_PATH);
    if (loadProjectConfig(env.root).config.mode === 'strict') {
      return {
        summary: summary({ status: 'skipped', reason: 'strict mode ignores the baseline' }),
        created: false,
      };
    }
    if (fs.existsSync(file)) {
      return {
        summary: summary({ status: 'exists', ...countsOfBaseline(env.root) }),
        created: false,
      };
    }
    if (!env.apply) return { summary: summary({ status: 'would-create' }), created: false };
    const { total, byKind } = await createBaseline(env.root);
    return { summary: summary({ status: 'created', total, byKind }), created: true };
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    return { summary: summary({ status: 'failed', reason }), created: false };
  }
};

/** The `.codemaps/setup.json` content, without the timestamp (which does not count as a change). */
interface SetupRecord {
  codemapsVersion: string;
  files: Array<{ path: string; sha256: string; version: string }>;
  agents: AgentId[];
  at?: string;
}

const parseRecord = (text: string | null): SetupRecord | null => {
  try {
    return text === null ? null : (JSON.parse(text) as SetupRecord);
  } catch {
    return null;
  }
};

/** The recorded files after this run: new hashes for written files, old ones kept for files left as they were. */
const mergeFiles = (
  previous: SetupRecord | null,
  version: string,
  outcomes: FileOutcome[]
): SetupRecord['files'] => {
  const files = new Map((previous?.files ?? []).map((entry) => [entry.path, entry]));
  for (const outcome of outcomes) {
    if (outcome.action === 'skipped' || !outcome.sha256) continue;
    // A file left as it is keeps its recorded hash, so hand edits inside it do not rewrite the record.
    if (outcome.action === 'unchanged' && files.has(outcome.path)) continue;
    files.set(outcome.path, {
      path: outcome.path,
      sha256: outcome.sha256,
      version: outcome.version ?? version,
    });
  }
  return [...files.values()].sort((a, b) => a.path.localeCompare(b.path));
};

/** Merges the files and agents of an earlier run with this one, so the record accumulates. */
const mergeRecord = (
  previous: SetupRecord | null,
  version: string,
  outcomes: FileOutcome[],
  agents: AgentId[]
): SetupRecord => ({
  codemapsVersion: version,
  files: mergeFiles(previous, version, outcomes),
  agents: [...new Set([...(previous?.agents ?? []), ...agents])].sort(),
});

/**
 * Records what setup wrote in `.codemaps/setup.json`. The file is rewritten only when its content
 * (ignoring the timestamp) changes, so repeated runs leave the project untouched.
 */
export const recordStep = (
  env: ApplyEnvironment,
  outcomes: FileOutcome[],
  agents: AgentId[]
): FileOutcome => {
  try {
    const file = resolveInsideRoot(env.root, SETUP_RECORD_PATH);
    const existing = readTextIfExists(file);
    const previous = parseRecord(existing);
    const next = mergeRecord(previous, env.version, outcomes, agents);
    if (previous && JSON.stringify({ ...previous, at: undefined }) === JSON.stringify(next)) {
      return { path: SETUP_RECORD_PATH, action: 'unchanged' };
    }
    if (env.apply) {
      writeTextAtomic(
        file,
        `${JSON.stringify({ ...next, at: new Date().toISOString() }, null, 2)}\n`
      );
    }
    return { path: SETUP_RECORD_PATH, action: existing === null ? 'created' : 'updated' };
  } catch (error) {
    if (!(error instanceof UnsafePathError)) throw error;
    return skippedProblem(SETUP_RECORD_PATH, error);
  }
};
