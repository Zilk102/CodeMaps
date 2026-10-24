/**
 * The comments of a source file and the lookups the engine makes on them: which comment block
 * sits directly above a line, and what text a comment says once its markers are removed.
 */

/** A comment as a parser found it, before its position in the line is classified. */
export interface RawComment {
  /** The comment including its markers (`//`, `#`, `/** ... *\/`). */
  text: string;
  /** 1-based first line. */
  startLine: number;
  /** 1-based last line. */
  endLine: number;
  /** 0-based column the comment starts at. */
  column: number;
}

/** A comment with the fact whether it stands on its own line(s). */
export interface SourceComment extends RawComment {
  /** Nothing but whitespace precedes it on its first line; trailing comments are not standalone. */
  standalone: boolean;
}

/** Whether a comment is a run of single-line comments rather than one block comment. */
export const isLineComment = (comment: SourceComment): boolean => !comment.text.startsWith('/*');

/** Marks every comment as standalone or trailing, judging by the text before it on its line. */
export const classifyComments = (raw: RawComment[], lines: string[]): SourceComment[] =>
  raw.map((comment) => ({
    ...comment,
    standalone: (lines[comment.startLine - 1] ?? '').slice(0, comment.column).trim() === '',
  }));

/** Looks up comment blocks by the line they end on. */
export class CommentIndex {
  private readonly byEndLine = new Map<number, SourceComment>();

  constructor(readonly comments: SourceComment[]) {
    for (const comment of comments) {
      if (comment.standalone) this.byEndLine.set(comment.endLine, comment);
    }
  }

  /**
   * The comments directly above a line, in source order: the block comment ending on the previous
   * line, or the run of single-line comments ending there. Empty when a blank line or code is
   * in between.
   */
  blockAbove(line: number): SourceComment[] {
    const last = this.byEndLine.get(line - 1);
    if (!last) return [];
    const block = [last];
    if (!isLineComment(last)) return block;
    for (
      let previous = this.byEndLine.get(block[0].startLine - 1);
      previous && isLineComment(previous);
      previous = this.byEndLine.get(block[0].startLine - 1)
    ) {
      block.unshift(previous);
    }
    return block;
  }
}

/** Groups comments into blocks: a block comment alone, or a run of adjacent single-line ones. */
export const groupIntoBlocks = (comments: SourceComment[]): SourceComment[][] => {
  const blocks: SourceComment[][] = [];
  for (const comment of comments) {
    const block = blocks[blocks.length - 1];
    const last = block?.[block.length - 1];
    const continues =
      last &&
      comment.standalone &&
      last.standalone &&
      isLineComment(last) &&
      isLineComment(comment);
    if (continues && last.endLine + 1 === comment.startLine) block.push(comment);
    else blocks.push([comment]);
  }
  return blocks;
};

const MARKER_PREFIX = /^\s*(\/\*[*!]?|\*\/|\*|\/\/[/!]?|#!?)\s?/;
const MARKER_SUFFIX = /\s*\*\/\s*$/;
const MARKUP_TAG = /<\/?[A-Za-z][^>]*>/g;

/** The lines of a comment with the markers (`/**`, `*`, `///`, `#`) cut off each one. */
export const commentLines = (text: string): string[] =>
  text.split(/\r?\n/).map((line) => line.replace(MARKER_PREFIX, '').replace(MARKER_SUFFIX, ''));

/** The words of a comment with its markers and XML tags removed. */
export const stripCommentMarkers = (text: string): string =>
  commentLines(text).join('\n').replace(MARKUP_TAG, ' ').trim();

/** The text of a comment block with markers removed, one line per source line. */
export const blockText = (block: SourceComment[]): string =>
  block.map((comment) => stripCommentMarkers(comment.text)).join('\n');
