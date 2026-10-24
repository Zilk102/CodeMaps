/**
 * Collects every comment of a file, in source order: with the TypeScript scanner for TS and JS,
 * and with a tree-sitter cursor for every other language. Comments inside strings, template
 * literals, regular expressions and JSX text are not comments, and are not reported.
 */
import ts from 'typescript';
import type { Tree } from 'web-tree-sitter';
import { createTemplateTracker } from '../clones/tokenize';
import type { RawComment } from './comments';

const { SyntaxKind } = ts;

/** Tokens after which a `/` divides instead of starting a regular expression. */
const ENDS_EXPRESSION = new Set<ts.SyntaxKind>([
  SyntaxKind.Identifier,
  SyntaxKind.PrivateIdentifier,
  SyntaxKind.NumericLiteral,
  SyntaxKind.BigIntLiteral,
  SyntaxKind.StringLiteral,
  SyntaxKind.RegularExpressionLiteral,
  SyntaxKind.NoSubstitutionTemplateLiteral,
  SyntaxKind.TemplateTail,
  SyntaxKind.CloseParenToken,
  SyntaxKind.CloseBracketToken,
  SyntaxKind.CloseBraceToken,
  SyntaxKind.ThisKeyword,
  SyntaxKind.SuperKeyword,
  SyntaxKind.TrueKeyword,
  SyntaxKind.FalseKeyword,
  SyntaxKind.NullKeyword,
  SyntaxKind.PlusPlusToken,
  SyntaxKind.MinusMinusToken,
]);

const isSlash = (kind: ts.SyntaxKind): boolean =>
  kind === SyntaxKind.SlashToken || kind === SyntaxKind.SlashEqualsToken;

/** Source ranges of JSX text, where `//` is plain text such as a URL. */
const jsxTextRanges = (source: ts.SourceFile): [number, number][] => {
  const ranges: [number, number][] = [];
  const visit = (node: ts.Node): void => {
    if (node.kind === SyntaxKind.JsxText) ranges.push([node.getStart(source), node.getEnd()]);
    else ts.forEachChild(node, visit);
  };
  visit(source);
  return ranges;
};

interface ScanState {
  scanner: ts.Scanner;
  source: ts.SourceFile;
  /** The last token that was not a comment or whitespace. */
  previous: ts.SyntaxKind;
  comments: RawComment[];
}

const COMMENT_KINDS = new Set<ts.SyntaxKind>([
  SyntaxKind.SingleLineCommentTrivia,
  SyntaxKind.MultiLineCommentTrivia,
]);

const TRIVIA_KINDS = new Set<ts.SyntaxKind>([
  SyntaxKind.WhitespaceTrivia,
  SyntaxKind.NewLineTrivia,
  SyntaxKind.ShebangTrivia,
  SyntaxKind.ConflictMarkerTrivia,
]);

/** Records the comment token the scanner stopped on, with its 1-based line span and column, so later steps can attach it to a declaration or a header. */
const recordComment = (state: ScanState): void => {
  const { scanner, source } = state;
  const start = scanner.getTokenStart();
  const from = source.getLineAndCharacterOfPosition(start);
  const to = source.getLineAndCharacterOfPosition(scanner.getTokenEnd());
  state.comments.push({
    text: scanner.getTokenText(),
    startLine: from.line + 1,
    endLine: to.line + 1,
    column: from.character,
  });
};

const handleToken = (state: ScanState, kind: ts.SyntaxKind): void => {
  if (COMMENT_KINDS.has(kind)) recordComment(state);
  else if (!TRIVIA_KINDS.has(kind)) state.previous = kind;
};

/**
 * Answers, for token starts that only increase, where the JSX text containing the position ends
 * (null when the position is not inside JSX text).
 */
const createJsxTextLocator = (ranges: [number, number][]) => {
  let index = 0;
  return (position: number): number | null => {
    while (index < ranges.length && ranges[index][1] <= position) index += 1;
    const range = ranges[index];
    return range && position >= range[0] ? range[1] : null;
  };
};

/** A `/` after something that ends an expression divides; anywhere else it starts a regex. */
const rescanSlash = (state: ScanState, kind: ts.SyntaxKind): ts.SyntaxKind =>
  isSlash(kind) && !ENDS_EXPRESSION.has(state.previous) ? state.scanner.reScanSlashToken() : kind;

/** Every comment of a TypeScript or JavaScript file; `jsx` says whether `<div>` is markup. */
export const scanTypeScriptComments = (
  source: ts.SourceFile,
  text: string,
  jsx: boolean
): RawComment[] => {
  const scanner = ts.createScanner(
    ts.ScriptTarget.Latest,
    false,
    jsx ? ts.LanguageVariant.JSX : ts.LanguageVariant.Standard,
    text
  );
  const trackTemplates = createTemplateTracker(scanner);
  const jsxTextEnd = createJsxTextLocator(jsx ? jsxTextRanges(source) : []);
  const state: ScanState = { scanner, source, previous: SyntaxKind.Unknown, comments: [] };
  for (let kind = scanner.scan(); kind !== SyntaxKind.EndOfFileToken; kind = scanner.scan()) {
    const resumeAt = jsxTextEnd(scanner.getTokenStart());
    if (resumeAt === null) handleToken(state, trackTemplates(rescanSlash(state, kind)));
    else scanner.resetTokenState(resumeAt);
  }
  return state.comments;
};

/** Every comment of a parsed tree-sitter file (nodes whose type ends in `comment`). */
export const scanTreeComments = (tree: Tree): RawComment[] => {
  const comments: RawComment[] = [];
  const cursor = tree.walk();
  for (;;) {
    const isComment = cursor.nodeIsNamed && cursor.nodeType.endsWith('comment');
    if (isComment) {
      comments.push({
        text: cursor.nodeText.trimEnd(),
        startLine: cursor.startPosition.row + 1,
        endLine: cursor.endPosition.row + 1,
        column: cursor.startPosition.column,
      });
    }
    const descended = !isComment && cursor.gotoFirstChild();
    while (!descended && !cursor.gotoNextSibling()) {
      if (!cursor.gotoParent()) {
        cursor.delete();
        return comments;
      }
    }
  }
};
