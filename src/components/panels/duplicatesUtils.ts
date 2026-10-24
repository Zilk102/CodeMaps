// Pure helpers for the duplicates panel: path and label formatting, group ordering and mapping a
// copy to its graph node.
import type { DuplicateAction, DuplicateCopy, DuplicateGroup } from '../../types/duplicates';
import type { GraphNode } from '../../types/graph';

/** Forward-slash path without a leading "./". */
export function normalizePath(path: string): string {
  return path.replace(/\\/g, '/').replace(/^\.\//, '');
}

/** `file:start-end` label for one copy (a single line collapses to `file:start`). */
export function formatCopy(copy: Pick<DuplicateCopy, 'file' | 'startLine' | 'endLine'>): string {
  const file = normalizePath(copy.file);
  if (copy.endLine <= copy.startLine) return `${file}:${copy.startLine}`;
  return `${file}:${copy.startLine}-${copy.endLine}`;
}

/** Keeps the last `maxSegments` path segments, prefixing "..." when something was cut. */
export function shortenPath(path: string, maxSegments = 3): string {
  const parts = normalizePath(path).split('/').filter(Boolean);
  if (parts.length <= maxSegments) return parts.join('/');
  return `.../${parts.slice(-maxSegments).join('/')}`;
}

const ACTION_LABEL_KEYS: Record<DuplicateAction, string> = {
  extract_function: 'duplicates.actions.extract_function',
  extract_shared_module: 'duplicates.actions.extract_shared_module',
  merge_into_one: 'duplicates.actions.merge_into_one',
};

/** i18n key of the badge text for a suggested action. */
export function actionLabelKey(action: DuplicateAction): string {
  return ACTION_LABEL_KEYS[action] ?? ACTION_LABEL_KEYS.extract_function;
}

/** Groups with the most duplicated lines first; ties broken by copy count, then id. */
export function sortGroups(groups: DuplicateGroup[]): DuplicateGroup[] {
  const weight = (g: DuplicateGroup) => g.lineCount * g.copies.length;
  return [...groups].sort(
    (a, b) => weight(b) - weight(a) || b.copies.length - a.copies.length || a.id.localeCompare(b.id)
  );
}

function pathMatches(candidate: string, wanted: string): boolean {
  return (
    candidate === wanted || candidate.endsWith(`/${wanted}`) || wanted.endsWith(`/${candidate}`)
  );
}

/** Graph node of the file a duplicate copy lives in, or null when it is not in the graph. */
export function findNodeForFile(nodes: GraphNode[], file: string): GraphNode | null {
  const wanted = normalizePath(file);
  const matches = nodes.filter((node) => {
    const ids = [node.filePath, node.id].filter((v): v is string => !!v);
    return ids.some((id) => pathMatches(normalizePath(id), wanted));
  });
  return matches.find((node) => node.type === 'file') ?? matches[0] ?? null;
}
