/**
 * The commands of `codemaps-guard` as functions from arguments to an exit code. Output goes
 * through an injected writer, so the CLI entry, the tests and the bundle smoke test drive exactly
 * the same code. Exit codes: 0 passed, 1 findings or a growing baseline, 2 usage or environment
 * error.
 */
import * as path from 'path';
import { baselinePath, createBaseline, readBaseline, refreshBaseline } from '../analysis/baseline';
import { normalizePath } from '../oracle/shared';
import { parseArgs, USAGE, type GuardArgs } from './args';
import { GuardGitError } from './changedFiles';
import { runCheck } from './evaluate';
import { measureHeadless } from './measure';
import { renderReport } from './render';
import { GUARD_VERSION } from './version';

/** Where a command writes: `out` for results, `err` for diagnostics and timing. */
export interface GuardIo {
  out: (text: string) => void;
  err: (text: string) => void;
}

/** Exit code of a successful run. */
export const EXIT_OK = 0;
/** Exit code when the project has new findings or the baseline grew. */
export const EXIT_FINDINGS = 1;
/** Exit code for a usage or environment problem (unknown option, bad git ref, no source files). */
export const EXIT_ERROR = 2;

const seconds = (startedAt: number): string => ((Date.now() - startedAt) / 1000).toFixed(1);

/** `check`: prints the report in the requested format and fails on new or worsened findings. */
const check = async (args: GuardArgs, io: GuardIo): Promise<number> => {
  const startedAt = Date.now();
  const report = await runCheck({ root: args.root, base: args.base, strict: args.strict });
  io.out(renderReport(report, args.format));
  io.err(`codemaps-guard: ${report.filesIndexed} files indexed in ${seconds(startedAt)} s\n`);
  return report.ok ? EXIT_OK : EXIT_FINDINGS;
};

/** `baseline`: records today's findings as accepted debt, or with `--refresh` lets the file shrink. */
const baseline = async (args: GuardArgs, io: GuardIo): Promise<number> => {
  const root = normalizePath(path.resolve(args.root));
  const existing = readBaseline(root) !== null;
  if (existing !== args.refresh) {
    io.err(
      existing
        ? 'A baseline exists. It may only shrink: run "baseline --refresh" to remove paid-down debt, or delete the file to start over.\n'
        : 'There is no baseline yet. Run "baseline" without --refresh to create it.\n'
    );
    return EXIT_ERROR;
  }
  const { sources } = await measureHeadless(root);
  if (args.refresh) {
    const shrunk = refreshBaseline(sources);
    io.out(
      `Baseline refreshed: ${shrunk.removed} removed, ${shrunk.tightened} lowered, ${shrunk.remaining} remaining.\n`
    );
    return EXIT_OK;
  }
  const created = createBaseline(sources);
  io.out(
    `Baseline written to ${path.relative(root, baselinePath(root)).replace(/\\/g, '/')}: ${created.total} findings accepted.\n`
  );
  return EXIT_OK;
};

/** Runs the command of `args`. */
const dispatch = (args: GuardArgs, io: GuardIo): Promise<number> | number => {
  if (args.command === 'version') {
    io.out(`${GUARD_VERSION}\n`);
    return EXIT_OK;
  }
  if (args.command === 'help') {
    io.out(USAGE);
    return EXIT_OK;
  }
  return args.command === 'check' ? check(args, io) : baseline(args, io);
};

/**
 * Runs `codemaps-guard` with the arguments after the program name and returns the exit code.
 * Expected failures (bad arguments, an unknown git ref, a folder without code) are printed as one
 * line on `err` and give exit code 2; they never produce a stack trace.
 */
export const runCli = async (argv: string[], io: GuardIo): Promise<number> => {
  const parsed = parseArgs(argv);
  if (!parsed.ok) {
    io.err(`${parsed.error}\n\n${USAGE}`);
    return EXIT_ERROR;
  }
  try {
    return await dispatch(parsed.args, io);
  } catch (error) {
    io.err(describeError(error));
    return EXIT_ERROR;
  }
};

/** One line for an expected failure (bad ref, no code); anything else keeps its stack for the bug report. */
const describeError = (error: unknown): string => {
  if (!(error instanceof Error)) return `codemaps-guard: ${String(error)}\n`;
  const expected = error instanceof GuardGitError || /No source code files/.test(error.message);
  return `codemaps-guard: ${expected ? error.message : (error.stack ?? error.message)}\n`;
};
