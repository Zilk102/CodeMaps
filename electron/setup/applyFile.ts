/**
 * Applies one planned file to the disk (or, in a dry run, only decides what would happen). This is
 * where the "never overwrite user content" rules live: shared files only change inside the
 * CodeMaps block, JSON is merged, owned files are rewritten only when they carry an older marker,
 * and anything unexpected is skipped with a reason instead of being forced.
 */
import { HOOK_COMMAND, mergeClaudeSettings } from './claudeSettings';
import { mergeOpenCodeConfig, openCodeServerEntry } from './openCodeConfig';
import {
  extractBlock,
  upsertBlock,
  upsertOwnedFile,
  type MarkerOutcome,
  type MarkerResult,
} from './markers';
import {
  readTextIfExists,
  resolveInsideRoot,
  sha256Of,
  UnsafePathError,
  writeTextAtomic,
} from './projectFiles';
import type { FileOutcome, PlannedFile } from './types';

/** Settings of one setup run that decide how a file is written. */
export interface ApplyEnvironment {
  root: string;
  version: string;
  force: boolean;
  /** False for a dry run: outcomes are computed but nothing is written. */
  apply: boolean;
}

/** What a strategy decided: the outcome and the text to write, if any. */
interface Decision {
  outcome: Omit<FileOutcome, 'path'>;
  text?: string;
}

const SKIP_REASONS: Partial<Record<MarkerOutcome, string>> = {
  newer: 'written by a newer CodeMaps version, left as is',
  foreign: 'exists and is not owned by CodeMaps, left as is',
  malformed: 'has a codemaps:start marker without codemaps:end, fix it by hand',
};

/** Marker outcomes that mean something is wrong and a person has to look at the file. */
const PROBLEM_OUTCOMES: MarkerOutcome[] = ['malformed'];

/**
 * Turns a marker result into a decision: skips carry a reason (and `problem` when a person must act),
 * an untouched file keeps its previous version, and a write records the version and the hash of what
 * CodeMaps wrote.
 */
const markerDecision = (result: MarkerResult, version: string, hashed: string | null): Decision => {
  const skipReason = SKIP_REASONS[result.outcome];
  if (skipReason) {
    return {
      outcome: {
        action: 'skipped',
        reason: skipReason,
        version: result.previousVersion,
        ...(PROBLEM_OUTCOMES.includes(result.outcome) ? { problem: true } : {}),
      },
    };
  }
  if (result.outcome === 'unchanged') {
    return {
      outcome: {
        action: 'unchanged',
        version: result.previousVersion,
        sha256: hashed ?? undefined,
      },
    };
  }
  const action = result.outcome === 'created' ? 'created' : 'updated';
  return { outcome: { action, version, sha256: hashed ?? undefined }, text: result.text };
};

const decideBlock = (
  file: PlannedFile,
  existing: string | null,
  env: ApplyEnvironment
): Decision => {
  const result = upsertBlock(existing, file.content, env.version, env.force);
  const block = extractBlock(result.text ?? existing ?? '');
  return markerDecision(result, env.version, block === null ? null : sha256Of(block));
};

/** Decision for a file CodeMaps owns: created, refreshed when its marker is older, or left to the user when it has no marker. */
const decideOwned = (
  file: PlannedFile,
  existing: string | null,
  env: ApplyEnvironment
): Decision => {
  const result = upsertOwnedFile(
    existing,
    file.content,
    env.version,
    file.style ?? 'html',
    env.force
  );
  const hashed = result.text ?? existing;
  return markerDecision(result, env.version, hashed === null ? null : sha256Of(hashed));
};

/** Decision for `.claude/settings.json`: merge the hook entry, or skip with a reason when the JSON cannot be merged safely. */
const decideClaudeHook = (existing: string | null): Decision => {
  const merge = mergeClaudeSettings(existing);
  if (merge.outcome === 'invalid') {
    return { outcome: { action: 'skipped', reason: merge.reason, problem: true } };
  }
  const sha256 = sha256Of(HOOK_COMMAND);
  if (merge.outcome === 'unchanged') return { outcome: { action: 'unchanged', sha256 } };
  const action = merge.outcome === 'created' ? 'created' : 'updated';
  return { outcome: { action, sha256 }, text: merge.text };
};

/** Decision for `opencode.json`: merge the server entry, or skip with a reason (and no `problem`, the caller shows the snippet) when the file is JSONC or not plain JSON. */
const decideOpenCodeConfig = (file: PlannedFile, existing: string | null): Decision => {
  if (file.path.endsWith('.jsonc')) {
    return {
      outcome: { action: 'skipped', reason: 'JSONC may hold comments, so it is not edited' },
    };
  }
  const merge = mergeOpenCodeConfig(existing, file.content);
  const sha256 = sha256Of(JSON.stringify(openCodeServerEntry(file.content)));
  if (merge.outcome === 'skipped') return { outcome: { action: 'skipped', reason: merge.reason } };
  if (merge.outcome === 'unchanged') return { outcome: { action: 'unchanged', sha256 } };
  const action = merge.outcome === 'created' ? 'created' : 'updated';
  return { outcome: { action, sha256 }, text: merge.text };
};

const decide = (file: PlannedFile, existing: string | null, env: ApplyEnvironment): Decision => {
  if (file.strategy === 'block') return decideBlock(file, existing, env);
  if (file.strategy === 'owned') return decideOwned(file, existing, env);
  if (file.strategy === 'opencode-config') return decideOpenCodeConfig(file, existing);
  return decideClaudeHook(existing);
};

/**
 * Applies `file` under the rules of its strategy and reports what happened. Never throws for
 * expected problems (unsafe path, invalid JSON, a file owned by the user): they come back as a
 * `skipped` outcome with a reason and `problem` set where a person has to act.
 */
export const applyPlannedFile = (file: PlannedFile, env: ApplyEnvironment): FileOutcome => {
  let absolute: string;
  try {
    absolute = resolveInsideRoot(env.root, file.path);
  } catch (error) {
    if (!(error instanceof UnsafePathError)) throw error;
    return { path: file.path, action: 'skipped', reason: error.message, problem: true };
  }
  const decision = decide(file, readTextIfExists(absolute), env);
  if (decision.text !== undefined && env.apply) writeTextAtomic(absolute, decision.text);
  return { path: file.path, ...decision.outcome };
};
