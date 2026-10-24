/**
 * Turns the findings of change validation into one issue per place, which is what a CI annotation
 * needs: a file, a line, a message and the fix hint. The findings themselves come from the same
 * `validateChanges` the MCP tool uses; this file only gives them coordinates.
 */
import {
  isBlockingFinding,
  isStrictBlockingFinding,
  type ChangeFinding,
} from '../analysis/ChangeValidationService';
import { relativeToRoot } from '../analysis/projectConfig/projectPaths';
import type { GraphData } from '../store/types';
import type { GuardIssue } from './types';

const SEVERITY_ORDER = { high: 0, medium: 1, low: 2 } as const;

/**
 * The line a piece of evidence points at: the symbol's start line in the graph, else the
 * "(line N)" or "(LN-LM)" range some messages carry, else the top of the file.
 */
const lineOf = (graph: GraphData, evidence: ChangeFinding['evidence'][number]): number => {
  const known = graph.nodes.find((node) => node.id === evidence.nodeId)?.sourceLocation?.startLine;
  return known ?? Number(/\((?:line |L)(\d+)/.exec(evidence.message)?.[1] ?? 1);
};

/** Under `--strict` every finding of a health-score kind fails the run, whatever its severity; otherwise only blocking ones do. */
const blocks = (finding: ChangeFinding, strict: boolean): boolean =>
  strict ? isStrictBlockingFinding(finding) : isBlockingFinding(finding);

/** One issue for a piece of evidence (`file` or `file#symbol`) of a finding. */
const issueFor = (
  graph: GraphData,
  finding: ChangeFinding,
  evidence: ChangeFinding['evidence'][number],
  strict: boolean
): GuardIssue => ({
  rule: finding.id,
  blocking: blocks(finding, strict),
  severity: finding.severity,
  file: relativeToRoot(graph.projectRoot, evidence.nodeId.split('#')[0]),
  line: lineOf(graph, evidence),
  message: `${finding.title}: ${evidence.message}`,
  fix: finding.fix,
});

/** A finding without evidence is reported once per file so that it is never lost. */
const issuesWithoutEvidence = (
  graph: GraphData,
  finding: ChangeFinding,
  strict: boolean
): GuardIssue[] =>
  finding.files.map((file) => ({
    rule: finding.id,
    blocking: blocks(finding, strict),
    severity: finding.severity,
    file: relativeToRoot(graph.projectRoot, file),
    line: 1,
    message: `${finding.title}: ${finding.description}`,
    fix: finding.fix,
  }));

/**
 * All issues of the findings, blocking ones first, then by file, line and rule so that output is
 * identical from run to run. With `strict` every issue blocks, not only high-severity ones.
 */
export const issuesOf = (
  graph: GraphData,
  findings: ChangeFinding[],
  strict: boolean
): GuardIssue[] =>
  findings
    .flatMap((finding) =>
      finding.evidence.length > 0
        ? finding.evidence.map((evidence) => issueFor(graph, finding, evidence, strict))
        : issuesWithoutEvidence(graph, finding, strict)
    )
    .sort(
      (a, b) =>
        Number(b.blocking) - Number(a.blocking) ||
        SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity] ||
        a.file.localeCompare(b.file) ||
        a.line - b.line ||
        a.rule.localeCompare(b.rule) ||
        a.message.localeCompare(b.message)
    );
