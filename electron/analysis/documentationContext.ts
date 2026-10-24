/**
 * The short `documentation` section of the prepare_change_context and prepare_review_context
 * results: which public symbols of the files an agent is about to touch still lack a doc comment,
 * so it documents them while it is there. Bounded, and absent when nothing was measured.
 */
import {
  documentationHint,
  type DocumentationReport,
  type UndocumentedSymbol,
} from './documentation';

/** Symbols and files listed per section; the rest is only counted. */
const MAX_LISTED = 8;

/** The documentation state of the touched files. */
export interface DocumentationContext {
  /** Coverage of the whole project, for scale. */
  projectCoveragePercent: number;
  /** Undocumented required symbols in the touched files (or the worst files when none are known). */
  undocumented: Pick<UndocumentedSymbol, 'file' | 'line' | 'name' | 'kind'>[];
  omitted: number;
  filesWithoutHeader: string[];
  /** What to do about it, in one sentence. */
  guidance: string;
}

const normalize = (value: string) => value.replace(/\\/g, '/').toLowerCase();
const fileOf = (nodeId: string) => nodeId.split('#')[0];

/**
 * The documentation section for `touched` (node ids or file paths). With no touched file the
 * section lists the project's worst files instead. Returns undefined while nothing is measured
 * or when there is nothing to report.
 */
export const buildDocumentationContext = (
  report: DocumentationReport | null,
  touched: string[]
): DocumentationContext | undefined => {
  if (!report) return undefined;
  const wanted = new Set(touched.map((id) => normalize(fileOf(id))));
  const worst = new Set(report.topOffenders.map((offender) => normalize(offender.file)));
  const inScope = (file: string) =>
    wanted.size > 0 ? wanted.has(normalize(file)) : worst.has(normalize(file));
  const undocumented = report.undocumented.filter((symbol) => inScope(symbol.file));
  const headers = report.filesWithoutHeader.filter(inScope);
  if (undocumented.length + headers.length === 0) return undefined;

  const listed = undocumented.slice(0, MAX_LISTED);
  return {
    projectCoveragePercent: report.coveragePercent,
    undocumented: listed.map(({ file, line, name, kind }) => ({ file, line, name, kind })),
    omitted: undocumented.length - listed.length,
    filesWithoutHeader: headers.slice(0, MAX_LISTED),
    guidance: `Document these while you are in the file. ${documentationHint(listed[0]?.kind ?? 'function')} Add a header comment to files that lack one, then verify with check_documentation.`,
  };
};
