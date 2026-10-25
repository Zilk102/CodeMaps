/**
 * `setup_project` itself: detects the project and the calling agent, writes the guardrail files
 * idempotently and reports what happened. A per-project lock makes concurrent calls safe, and
 * nothing is analyzed when the project is already set up: the baseline (the only step that needs
 * the code graph) is created once, on the first run.
 */
import * as fs from 'fs';
import { applyPlannedFile, type ApplyEnvironment } from './applyFile';
import { baselineStep, configStep, recordStep, type BaselineCreator } from './codemapsFiles';
import { detectAgents } from './detectAgents';
import { detectProject } from './detectProject';
import { agentNotes, agentSteps } from './openCodePlan';
import { DEFAULT_MCP_ENDPOINT, planContext, planFiles } from './planFiles';
import { isSameFile, resolveInsideRoot, UnsafePathError } from './projectFiles';
import { withProjectLock } from './projectLock';
import { ciFilePaths } from './ciFiles';
import { buildNextSteps, ciSuggestionFor } from './setupAdvice';
import type {
  BaselineSummary,
  DetectedAgents,
  DetectedProject,
  FileOutcome,
  PlannedFile,
  SetupOptions,
  SetupResult,
} from './types';

/** What the orchestrator needs from the outside world; tests replace the baseline creator. */
export interface SetupDependencies {
  createBaseline: BaselineCreator;
}

/** CLAUDE.md that links to AGENTS.md would import itself, so it is left alone. */
const isLinkedToAgentsFile = (root: string, file: PlannedFile): boolean => {
  if (file.path !== 'CLAUDE.md') return false;
  try {
    return isSameFile(resolveInsideRoot(root, 'CLAUDE.md'), resolveInsideRoot(root, 'AGENTS.md'));
  } catch (error) {
    if (error instanceof UnsafePathError) return false;
    throw error;
  }
};

const applyAll = (files: PlannedFile[], env: ApplyEnvironment): FileOutcome[] =>
  files.map((file) =>
    isLinkedToAgentsFile(env.root, file)
      ? { path: file.path, action: 'skipped' as const, reason: 'same file as AGENTS.md' }
      : applyPlannedFile(file, env)
  );

const pathsWhere = (outcomes: FileOutcome[], action: FileOutcome['action']): string[] =>
  outcomes.filter((outcome) => outcome.action === action).map((outcome) => outcome.path);

const warningsOf = (outcomes: FileOutcome[], baseline: BaselineSummary): string[] => {
  const warnings = outcomes
    .filter((outcome) => outcome.problem)
    .map((outcome) => `${outcome.path}: ${outcome.reason}`);
  if (baseline.status === 'failed') warnings.push(`baseline not created: ${baseline.reason}`);
  return warnings;
};

/** The files an applying run would create or update, including the baseline when it is missing. */
const pendingWrites = (
  outcomes: FileOutcome[],
  baseline: BaselineSummary
): NonNullable<SetupResult['wouldWrite']> => {
  const pending: NonNullable<SetupResult['wouldWrite']> = [];
  for (const outcome of outcomes) {
    if (outcome.action === 'created') pending.push({ path: outcome.path, action: 'create' });
    if (outcome.action === 'updated') pending.push({ path: outcome.path, action: 'update' });
  }
  if (baseline.status === 'would-create') pending.push({ path: baseline.path, action: 'create' });
  return pending;
};

/** What the steps of one run produced, before it is turned into the report. */
interface RunState {
  detected: DetectedProject;
  agents: DetectedAgents;
  outcomes: FileOutcome[];
  baseline: BaselineSummary;
}

/** Detects, plans and applies every file; the only place where the steps are ordered. */
const execute = async (
  options: SetupOptions,
  env: ApplyEnvironment,
  deps: SetupDependencies
): Promise<RunState> => {
  const detected = detectProject(options.root);
  const agents = detectAgents(options.root, options.clientName, options.agents);
  const outcomes = applyAll(
    planFiles(options.root, agents.selected, detected, options.version),
    env
  );
  outcomes.push(configStep(env));
  const baseline = await baselineStep(env, deps.createBaseline);
  if (baseline.created) outcomes.push({ path: baseline.summary.path, action: 'created' });
  outcomes.push(recordStep(env, outcomes, agents.selected));
  return { detected, agents, outcomes, baseline: baseline.summary };
};

const statusOf = (apply: boolean, warnings: string[]): SetupResult['status'] => {
  if (!apply) return 'dry-run';
  return warnings.length > 0 ? 'partial' : 'ok';
};

/** Remarks about the run: the unknown-client fallback and the choices made for OpenCode and the DeepSeek Harness. */
const notesOf = (options: SetupOptions, agents: DetectedAgents): string[] => [
  ...(agents.note ? [agents.note] : []),
  ...agentNotes(planContext(options.root, agents.selected, '')),
];

/** Turns the state of a run into the compact report the tool returns. */
const report = (options: SetupOptions, state: RunState): SetupResult => {
  const { detected, agents, outcomes, baseline } = state;
  const written = options.apply ? pathsWhere(outcomes, 'created') : [];
  const updated = options.apply ? pathsWhere(outcomes, 'updated') : [];
  const pending = pendingWrites(outcomes, baseline);
  const warnings = warningsOf(outcomes, baseline);
  const changed = options.apply ? written.length + updated.length : pending.length;
  return {
    status: statusOf(options.apply, warnings),
    upToDate: changed === 0 && baseline.status !== 'failed',
    projectRoot: options.root,
    codemapsVersion: options.version,
    detected: { ...detected, agents },
    written,
    updated,
    unchanged: pathsWhere(outcomes, 'unchanged'),
    skipped: outcomes
      .filter((outcome) => outcome.action === 'skipped')
      .map((outcome) => ({ path: outcome.path, reason: outcome.reason ?? 'skipped' })),
    ...(options.apply ? {} : { wouldWrite: pending }),
    baseline,
    warnings,
    notes: notesOf(options, agents),
    nextSteps: buildNextSteps({
      apply: options.apply,
      changed: changed > 0,
      warnings,
      baseline,
      agents: agents.selected,
      ciFiles: ciFilePaths(options.root, detected),
      agentSteps: agentSteps(outcomes, agents.selected, DEFAULT_MCP_ENDPOINT),
    }),
    ciSuggestion: ciSuggestionFor(options.root, detected),
  };
};

/**
 * Sets a project up for AI agents: writes the AGENTS.md section, the files of every detected
 * agent, the `.codemaps` config, baseline and record, and returns a compact report. Safe to call
 * repeatedly and concurrently (calls for one project are queued); a second run writes nothing.
 * The root must be an existing directory; the caller validates that.
 */
export const setupProject = async (
  options: SetupOptions,
  deps: SetupDependencies
): Promise<SetupResult> => {
  const env: ApplyEnvironment = {
    root: options.root,
    version: options.version,
    force: options.force,
    apply: options.apply,
  };
  const key = fs.realpathSync(options.root).toLowerCase();
  return withProjectLock(key, async () => report(options, await execute(options, env, deps)));
};
