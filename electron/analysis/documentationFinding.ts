/**
 * The `missing_documentation` finding of change validation: the undocumented public symbols and
 * header-less files among the files an agent changed, or the worst offenders of the project when
 * no change is known. Kept apart from `ChangeValidationService` so that file stays about patterns.
 */
import type { ChangeFinding } from './ChangeValidationService';
import { HEADER_HINT, documentationHint, type DocumentationReport } from './documentation';

/** Finding id, shared with the tool descriptions and the agent skill. */
export const MISSING_DOCUMENTATION_ID = 'missing_documentation';

const MAX_EVIDENCE = 5;
const MAX_FILES = 10;
const FIX =
  'Add a doc comment to each listed symbol and a header comment to each listed file: state the purpose, the contract and why it exists. Never repeat the name; do not comment out code.';

const normalize = (value: string) => value.replace(/\\/g, '/').toLowerCase();

/** A medium-severity `missing_documentation` finding, bounded to a few files and evidence lines. */
const finding = (
  files: string[],
  evidence: ChangeFinding['evidence'],
  description: string
): ChangeFinding => ({
  id: MISSING_DOCUMENTATION_ID,
  severity: 'medium',
  title: 'Missing documentation',
  description,
  files: files.slice(0, MAX_FILES),
  evidence: evidence.slice(0, MAX_EVIDENCE),
  fix: FIX,
});

/** The finding for the changed files, or null when they are documented (or not measured). */
export const documentationFindingForChanges = (
  report: DocumentationReport | null,
  changedFiles: string[]
): ChangeFinding | null => {
  if (!report) return null;
  const changed = new Set(changedFiles.map(normalize));
  const symbols = report.undocumented.filter((symbol) => changed.has(normalize(symbol.file)));
  const headers = report.filesWithoutHeader.filter((file) => changed.has(normalize(file)));
  if (symbols.length + headers.length === 0) return null;

  const evidence = [
    ...headers.map((file) => ({ nodeId: file, message: `No header comment. ${HEADER_HINT}` })),
    ...symbols.map((symbol) => ({
      nodeId: `${symbol.file}#${symbol.name}`,
      message: `${symbol.kind} ${symbol.name} (line ${symbol.line}) has no doc comment. ${documentationHint(symbol.kind)}`,
    })),
  ];
  const files = [...new Set([...headers, ...symbols.map((symbol) => symbol.file)])];
  return finding(
    files,
    evidence,
    `${symbols.length} public symbol(s) without a doc comment and ${headers.length} file(s) without a header in the files you changed.`
  );
};

/** The finding for a whole-project check: the files with the most undocumented symbols. */
export const documentationFindingForProject = (
  report: DocumentationReport | null
): ChangeFinding | null => {
  if (!report || report.undocumented.length + report.filesWithoutHeader.length === 0) return null;
  const evidence = report.topOffenders.map((offender) => ({
    nodeId: offender.file,
    message: `${offender.missing} of ${offender.required} required symbols undocumented (${offender.coverage}% covered).`,
  }));
  return finding(
    report.topOffenders.map((offender) => offender.file),
    evidence,
    `Documentation covers ${report.coveragePercent}% of the required symbols; ${report.undocumented.length} symbol(s) and ${report.filesWithoutHeader.length} file(s) lack comments. Worst offenders listed.`
  );
};
