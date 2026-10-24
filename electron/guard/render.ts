/**
 * Renders a `GuardReport` as plain text, GitHub Actions workflow commands or JSON. Rendering is a
 * pure function of the report (no clock, no environment), so the same code gives the same bytes
 * on every run and every machine.
 */
import type { LegacyDebtSummary } from '../analysis/baseline/types';
import type { BaselineGrowth, GuardIssue, GuardReport, OutputFormat } from './types';

const BASELINE_FILE = '.codemaps/baseline.json';
const MAX_LISTED_FINGERPRINTS = 10;
/** Advisory issues listed per run; CI logs and annotation panels drown in more, the rest is counted. */
const MAX_ADVISORY_LISTED = 10;

/** `kind count` pairs of a per-kind summary, largest first. */
const kindList = (byKind: Record<string, number | undefined>): string =>
  Object.entries(byKind)
    .filter((entry): entry is [string, number] => entry[1] !== undefined)
    .sort(([a, x], [b, y]) => y - x || a.localeCompare(b))
    .map(([kind, count]) => `${kind} ${count}`)
    .join(', ');

/** One line about the old debt a ratchet accepted. */
const debtLine = (debt: LegacyDebtSummary): string => {
  const kinds = kindList(debt.byKind);
  return (
    `Legacy debt: ${debt.total} accepted${kinds ? ` (${kinds})` : ''}, ` +
    `${debt.paidDown.total} paid down, ${debt.worsened} worsened.`
  );
};

/** Why the baseline rule failed, naming the first few entries. */
const growthMessage = (growth: BaselineGrowth): string => {
  const named = [...growth.added, ...growth.raised.map((entry) => entry.fingerprint)]
    .slice(0, MAX_LISTED_FINGERPRINTS)
    .join(', ');
  const count = growth.added.length + growth.raised.length;
  return (
    `${BASELINE_FILE} grew compared with the base ref (${growth.added.length} new, ` +
    `${growth.raised.length} raised): ${named}${count > MAX_LISTED_FINGERPRINTS ? ', ...' : ''}. ` +
    'The baseline may only shrink: fix the findings instead of recording them.'
  );
};

/** Where the run looked, in one phrase. */
const scopeLine = (report: GuardReport): string =>
  report.scope === 'changed'
    ? `${report.changedFiles.length} file(s) changed since ${report.base}`
    : `the whole project (${report.filesIndexed} files)`;

/** How findings were judged: against the baseline, strictly, or with every finding counting because there is no baseline. */
const basisOf = (report: GuardReport): string => {
  if (report.baselineApplied) return 'ratchet with baseline';
  return report.mode === 'strict' || report.strict ? 'strict' : 'no baseline';
};

/** Blocking issues, and the advisory ones cut to the listing limit (with how many were left out). */
const listedIssues = (report: GuardReport): { shown: GuardIssue[]; hidden: number } => {
  const blocking = report.issues.filter((issue) => issue.blocking);
  const advisory = report.issues.filter((issue) => !issue.blocking);
  return {
    shown: [...blocking, ...advisory.slice(0, MAX_ADVISORY_LISTED)],
    hidden: Math.max(0, advisory.length - MAX_ADVISORY_LISTED),
  };
};

/** The closing lines shared by the text and GitHub formats. */
const summaryLines = (report: GuardReport): string[] => {
  const blocking = report.issues.filter((issue) => issue.blocking).length;
  const { hidden } = listedIssues(report);
  const note = hidden > 0 ? ` (${hidden} not listed; use --format json for all)` : '';
  const lines = [
    `Checked ${scopeLine(report)}; ${basisOf(report)}.`,
    `${blocking} blocking, ${report.issues.length - blocking} advisory${note}.`,
  ];
  if (report.legacyDebt) lines.push(debtLine(report.legacyDebt));
  for (const warning of report.configWarnings) lines.push(`Config warning: ${warning}`);
  lines.push(report.ok ? 'Result: PASSED' : 'Result: FAILED');
  return lines;
};

const issueText = (issue: GuardIssue): string[] => [
  `${issue.blocking ? 'FAIL' : 'WARN'} ${issue.file}:${issue.line} [${issue.rule}] ${issue.message}`,
  `     fix: ${issue.fix}`,
];

/** Human-readable report: blocking issues first, each with its fix hint, then the summary. */
export const renderText = (report: GuardReport): string => {
  const lines = listedIssues(report).shown.flatMap(issueText);
  if (report.baselineGrowth?.grew)
    lines.push(`FAIL ${BASELINE_FILE} ${growthMessage(report.baselineGrowth)}`);
  return [...lines, ...(lines.length > 0 ? [''] : []), ...summaryLines(report)].join('\n') + '\n';
};

/** Escapes the message part of a workflow command. */
const escapeData = (value: string): string =>
  value.replace(/%/g, '%25').replace(/\r/g, '%0D').replace(/\n/g, '%0A');

/** Escapes a property (file, title) of a workflow command. */
const escapeProperty = (value: string): string =>
  escapeData(value).replace(/:/g, '%3A').replace(/,/g, '%2C');

const annotation = (
  level: 'error' | 'warning',
  file: string,
  line: number,
  title: string,
  message: string
): string =>
  `::${level} file=${escapeProperty(file)},line=${line},title=${escapeProperty(title)}::${escapeData(message)}`;

/** GitHub Actions workflow commands: one `::error` or `::warning` per issue, then the plain summary. */
export const renderGithub = (report: GuardReport): string => {
  const commands = listedIssues(report).shown.map((issue) =>
    annotation(
      issue.blocking ? 'error' : 'warning',
      issue.file,
      issue.line,
      issue.rule,
      `${issue.message} Fix: ${issue.fix}`
    )
  );
  if (report.baselineGrowth?.grew) {
    commands.push(
      annotation('error', BASELINE_FILE, 1, 'baseline_grew', growthMessage(report.baselineGrowth))
    );
  }
  return [...commands, ...summaryLines(report)].join('\n') + '\n';
};

/** The report as JSON with a fixed key order. */
export const renderJson = (report: GuardReport): string => `${JSON.stringify(report, null, 2)}\n`;

const RENDERERS: Record<OutputFormat, (report: GuardReport) => string> = {
  text: renderText,
  github: renderGithub,
  json: renderJson,
};

/** The report in the requested format. */
export const renderReport = (report: GuardReport, format: OutputFormat): string =>
  RENDERERS[format](report);
