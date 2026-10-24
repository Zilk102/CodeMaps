/**
 * Baseline findings about duplicated code. A clone group becomes one finding per copy, named after
 * the function that contains the copy, so the finding keeps its identity when lines shift. The
 * measure is the size of the copied block: a copy that grows is a worsened finding.
 */
import type { GraphData } from '../../store/types';
import type { ModuleQualitySummary } from '../moduleQualityMetrics';
import { isSevereClone } from '../patternDetectionQuality';
import type { FindingDraft } from './types';

type CloneGroups = NonNullable<ModuleQualitySummary['codeClones']>;
type CloneInstance = CloneGroups[number]['instances'][number];

interface SymbolRange {
  name: string;
  startLine: number;
  endLine: number;
}

/** Name used for a copy that sits outside every declared function or class. */
const TOP_LEVEL_SYMBOL = '(top level)';
// The token-level detector names a copy `file.ts:12-40`; the function-body fallback uses the name.
const POSITIONAL_NAME = /:(\d+)-\d+$/;

/** The declared symbols of every file with their line ranges, from the graph. */
const symbolRanges = (graph: GraphData): Map<string, SymbolRange[]> => {
  const byFile = new Map<string, SymbolRange[]>();
  for (const node of graph.nodes) {
    const separator = node.id.indexOf('#');
    if (separator < 0 || !node.sourceLocation) continue;
    const file = node.id.slice(0, separator);
    const ranges = byFile.get(file) ?? [];
    ranges.push({
      name: node.id.slice(separator + 1),
      startLine: node.sourceLocation.startLine,
      endLine: node.sourceLocation.endLine,
    });
    byFile.set(file, ranges);
  }
  return byFile;
};

/** The innermost declared symbol that contains `line`, or the top-level marker. */
const enclosingSymbol = (ranges: SymbolRange[] | undefined, line: number): string => {
  const containing = (ranges ?? []).filter(
    (range) => range.startLine <= line && line <= range.endLine
  );
  containing.sort((a, b) => a.endLine - a.startLine - (b.endLine - b.startLine));
  return containing[0]?.name ?? TOP_LEVEL_SYMBOL;
};

/** The symbol and first line of one copy. */
const locate = (
  instance: CloneInstance,
  ranges: Map<string, SymbolRange[]>
): { symbol: string; line: number } => {
  const positional = POSITIONAL_NAME.exec(instance.methodName);
  if (!positional) return { symbol: instance.methodName, line: 0 };
  const line = Number(positional[1]);
  return { symbol: enclosingSymbol(ranges.get(instance.nodeId), line), line };
};

/**
 * One draft per copy of every clone group, for the files `include` accepts. The message names the
 * other places that hold the same code.
 */
export const collectCloneFindings = (
  graph: GraphData,
  groups: CloneGroups | null | undefined,
  include: (path: string) => boolean
): FindingDraft[] => {
  const ranges = symbolRanges(graph);
  return (groups ?? []).flatMap((group) =>
    group.instances
      .filter((instance) => include(instance.nodeId))
      .map((instance) => {
        const others = group.instances
          .filter((other) => other !== instance)
          .map((other) => other.methodName);
        const { symbol, line } = locate(instance, ranges);
        return {
          kind: 'clone' as const,
          path: instance.nodeId,
          symbol,
          line,
          measure: instance.lineCount,
          severity: isSevereClone(instance.lineCount, group.instances.length)
            ? ('high' as const)
            : ('medium' as const),
          message: `${instance.lineCount} duplicated lines at ${instance.methodName}; the same code is also at ${others.join(', ')}. Extract it once and reuse it.`,
        };
      })
  );
};
