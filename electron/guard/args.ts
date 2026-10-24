/**
 * Command line parsing of `codemaps-guard`. It is hand-written because the grammar is tiny and the
 * bundle must stay free of extra dependencies; every mistake becomes a message instead of a stack
 * trace, and nothing here touches the file system.
 */
import { OUTPUT_FORMATS, type OutputFormat } from './types';

/** The commands the guard understands. */
export const COMMANDS = ['check', 'baseline', 'version', 'help'] as const;

/** One of `COMMANDS`. */
export type GuardCommand = (typeof COMMANDS)[number];

/** A parsed command line. */
export interface GuardArgs {
  command: GuardCommand;
  root: string;
  base?: string;
  format: OutputFormat;
  strict: boolean;
  refresh: boolean;
}

/** The result of parsing: the arguments, or what was wrong with the line. */
export type ParsedArgs = { ok: true; args: GuardArgs } | { ok: false; error: string };

/** Usage text, shown for `help` and after a parse error. */
export const USAGE = `codemaps-guard: architecture and documentation guardrails for CI

Usage:
  codemaps-guard check [--root <dir>] [--base <git ref>] [--format text|github|json] [--strict]
  codemaps-guard baseline [--root <dir>] [--refresh]
  codemaps-guard version

check      Judge the project (or only the files changed since --base) with the rules of
           .codemaps/config.json and the baseline in .codemaps/baseline.json. Exit code 1 when a
           new or worsened finding exists, or when the baseline grew compared with --base.
           --strict ignores the baseline and fails on every finding.
baseline   Create .codemaps/baseline.json from the current findings. With --refresh it can only
           shrink the existing file. This is the only command that writes files.
`;

/** Options that take a value, and the argument field each sets. */
const VALUE_OPTIONS = new Set(['--root', '--base', '--format']);

/** Checks a `--format` value. */
const isFormat = (value: string): value is OutputFormat =>
  (OUTPUT_FORMATS as readonly string[]).includes(value);

/** Applies one option to the arguments; returns an error message for a bad value. */
const applyValue = (args: GuardArgs, option: string, value: string): string | null => {
  if (option === '--root') args.root = value;
  else if (option === '--base') args.base = value;
  else if (isFormat(value)) args.format = value;
  else return `--format must be one of ${OUTPUT_FORMATS.join(', ')}, not "${value}".`;
  return null;
};

/** Applies a switch (`--strict`, `--refresh`); false when the option is not known. */
const applyFlag = (args: GuardArgs, option: string): boolean => {
  if (option === '--strict') args.strict = true;
  else if (option === '--refresh') args.refresh = true;
  else return false;
  return true;
};

/** Splits `--name=value` into its parts; a plain option has no value part. */
const splitOption = (token: string): [string, string | undefined] => {
  const at = token.indexOf('=');
  return token.startsWith('--') && at > 0
    ? [token.slice(0, at), token.slice(at + 1)]
    : [token, undefined];
};

/**
 * Parses the arguments that follow the program name. The first word is the command (`help` when
 * absent); options may appear in any order and take `--name value` or `--name=value`.
 */
export const parseArgs = (argv: string[]): ParsedArgs => {
  const [first = 'help', ...rest] = argv;
  if (!(COMMANDS as readonly string[]).includes(first)) {
    return { ok: false, error: `Unknown command "${first}".` };
  }
  const args: GuardArgs = {
    command: first as GuardCommand,
    root: '.',
    format: 'text',
    strict: false,
    refresh: false,
  };
  let index = 0;
  while (index < rest.length) {
    const consumed = applyToken(args, rest[index], rest[index + 1]);
    if (typeof consumed === 'string') return { ok: false, error: consumed };
    index += consumed;
  }
  return { ok: true, args };
};

/**
 * Applies the option in `token` (taking `next` as its value when it has none of its own) and
 * returns how many tokens it used, or the error message.
 */
const applyToken = (args: GuardArgs, token: string, next: string | undefined): number | string => {
  const [option, inline] = splitOption(token);
  if (applyFlag(args, option)) return 1;
  if (!VALUE_OPTIONS.has(option)) return `Unknown option "${token}".`;
  const value = inline ?? next;
  if (!value) return `${option} needs a value.`;
  return applyValue(args, option, value) ?? (inline === undefined ? 2 : 1);
};
