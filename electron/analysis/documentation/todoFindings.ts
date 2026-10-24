/**
 * Finds TODO, FIXME and HACK markers that name neither an owner nor an issue. They are reported
 * as information only and never count against the coverage.
 */
import type { SourceComment } from './comments';
import type { UnownedTodo } from './types';

const MARKER = /\b(TODO|FIXME|HACK)\b(.*)/;
// `TODO(alice)`, `TODO @alice`, `FIXME #123`, `HACK PROJ-42`, or a link.
const OWNER = /^\s*(\([^)]+\)|\[[^\]]+\]|@\w)|#\d+|\b[A-Z][A-Z0-9]+-\d+\b|https?:\/\//;

/** The unowned markers of the comments, in source order. */
export const findUnownedTodos = (comments: SourceComment[]): UnownedTodo[] => {
  const found: UnownedTodo[] = [];
  for (const comment of comments) {
    comment.text.split('\n').forEach((line, offset) => {
      const match = MARKER.exec(line);
      if (match && !OWNER.test(match[2])) {
        found.push({ line: comment.startLine + offset, tag: match[1] });
      }
    });
  }
  return found;
};
