/**
 * The headless equivalent of the `validate_architecture_changes` tool. It measures the project in
 * memory and hands the detected patterns to `validateChanges` together with the project's
 * ratchet, so a CI job reaches the same verdict an agent gets from the running app. Changed files
 * come from a git base ref, or the whole project is judged.
 */
import * as path from 'path';
import { loadRatchet } from '../analysis/baseline';
import { validateChanges } from '../analysis/ChangeValidationService';
import { loadProjectConfig } from '../analysis/projectConfig/configLoader';
import { normalizePath } from '../oracle/shared';
import { baselineGrowthSince } from './baselineGrowth';
import { changedFilesSince } from './changedFiles';
import { issuesOf } from './issues';
import { measureHeadless, type Measurement } from './measure';
import type { BaselineGrowth, GuardReport } from './types';

/** What `check` is asked to do. */
export interface CheckOptions {
  /** Project folder; relative paths are resolved against the working directory. */
  root: string;
  /** Git ref to diff against; leave out to judge every file of the project. */
  base?: string;
  /** Ignore the baseline and let every finding, not only high severity ones, fail the run. */
  strict?: boolean;
}

/** Health score handed to the validation: it is consulted only for a project without changed files, which a check never asks for. */
const NEUTRAL_HEALTH_SCORE = 100;

/** Report fields that do not depend on what was found. */
const reportShell = (
  root: string,
  options: CheckOptions,
  growth: BaselineGrowth | null
): GuardReport => {
  const config = loadProjectConfig(root);
  return {
    scope: options.base ? 'changed' : 'project',
    base: options.base ?? null,
    mode: config.config.mode,
    baselineApplied: false,
    strict: options.strict === true,
    filesIndexed: 0,
    changedFiles: [],
    issues: [],
    legacyDebt: null,
    baselineGrowth: growth,
    configWarnings: config.warnings,
    ok: !growth?.grew,
  };
};

/** The files to judge as absolute graph ids: the changed ones, or every file of the project. */
const filesToJudge = (root: string, changed: string[] | null, measured: Measurement): string[] =>
  changed
    ? changed.map((file) => `${root}/${file}`)
    : measured.sources.graph.nodes.filter((node) => node.type === 'file').map((node) => node.id);

/** Judges the measured project and fills the findings into `shell`. */
const judge = (
  shell: GuardReport,
  measured: Measurement,
  changed: string[] | null
): GuardReport => {
  const { sources, detection } = measured;
  const root = sources.graph.projectRoot;
  const ratchet = shell.strict ? null : loadRatchet(sources);
  const result = validateChanges({
    patterns: detection.patterns,
    changedFiles: filesToJudge(root, changed, measured),
    healthScore: NEUTRAL_HEALTH_SCORE,
    documentation: sources.documentation,
    ratchet,
  });
  const issues = issuesOf(sources.graph, result.findings, shell.strict);
  return {
    ...shell,
    baselineApplied: ratchet !== null,
    filesIndexed: measured.fileCount,
    changedFiles: changed ?? [],
    issues,
    legacyDebt: result.legacyDebt ?? null,
    ok: shell.ok && !issues.some((issue) => issue.blocking),
  };
};

/**
 * Judges a project (or the files changed since `base`) the way the MCP tool would and returns the
 * report. When the base ref shows no changed file nothing is indexed at all and only the baseline
 * rule can fail. Throws for an unusable git ref or a folder without source files; findings are
 * never thrown, they are in the report.
 */
export const runCheck = async (options: CheckOptions): Promise<GuardReport> => {
  const root = normalizePath(path.resolve(options.root));
  const changed = options.base ? changedFilesSince(root, options.base) : null;
  const growth = options.base ? baselineGrowthSince(root, options.base) : null;
  const shell = reportShell(root, options, growth);
  if (changed?.length === 0) return shell;
  return judge(shell, await measureHeadless(root), changed);
};
