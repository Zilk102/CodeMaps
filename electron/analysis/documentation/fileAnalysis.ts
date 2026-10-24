/**
 * Turns one source file into a `FileDocumentation`: parses it, finds the doc comment of every
 * declaration, rates the comments, and decides whether the file opens with a header.
 */
import * as path from 'path';
import { hasGeneratedMarker, isGeneratedPath } from '../generatedFiles';
import { isTestFile } from '../testFiles';
import {
  blockText,
  classifyComments,
  CommentIndex,
  groupIntoBlocks,
  type RawComment,
  type SourceComment,
} from './comments';
import { findCommentedOutCode } from './commentedOutCode';
import { conventionForFile, isDocComment, type DocConvention } from './conventions';
import type { RawDeclaration } from './declarations';
import { assessDocQuality, docWords } from './docQuality';
import { compareText } from './ordering';
import { parseSource, type ParsedFile } from './fileParsing';
import {
  HEADER_MAX_START_LINE,
  isDocumentationRequired,
  isHeaderRequired,
  MIN_HEADER_WORDS,
} from './policy';
import { findUnownedTodos } from './todoFindings';
import type { ExemptReason, FileDocumentation, HeaderStatus, SymbolDocumentation } from './types';

// Text that is a notice or a tool directive rather than a description of the file.
const NOT_A_HEADER =
  /copyright|spdx-|all rights reserved|licensed under|permission is hereby granted|without warranty|^(eslint|tslint|prettier|istanbul|c8|@ts-|@flow|jshint|rubocop|nolint|noinspection|lint:|shellcheck|-\*-|frozen_string_literal|encoding|coding|go:|\+build|vim:|region|endregion)/i;

/** The text of the doc comment directly above a line, or null when there is none. */
const docTextAbove = (
  index: CommentIndex,
  convention: DocConvention,
  anchorLine: number
): string | null => {
  const block = index.blockAbove(anchorLine);
  let first = block.length;
  while (first > 0 && isDocComment(convention, block[first - 1])) first -= 1;
  return first === block.length ? null : blockText(block.slice(first));
};

/** Turns a raw declaration and its doc text into the reported symbol: whether the policy requires documentation for it and how good the existing comment is. */
const toSymbol = (declaration: RawDeclaration, docText: string | null): SymbolDocumentation => {
  const lineCount = declaration.endLine - declaration.line + 1;
  return {
    name: declaration.name,
    kind: declaration.kind,
    line: declaration.line,
    exported: declaration.exported,
    required: isDocumentationRequired({
      kind: declaration.kind,
      exported: declaration.exported,
      exempt: declaration.exempt,
      lineCount,
    }),
    documented: docText !== null,
    quality: docText === null ? 'ok' : assessDocQuality(declaration.name, docText),
  };
};

/** Attaches doc comments to the declarations of a file (inline docstring first, then the comment block above the anchor) and returns their verdicts. */
const documentSymbols = (
  declarations: RawDeclaration[],
  index: CommentIndex,
  convention: DocConvention
): SymbolDocumentation[] =>
  declarations
    .map((declaration) =>
      toSymbol(
        declaration,
        declaration.docstring !== undefined
          ? declaration.docstring
          : docTextAbove(index, convention, declaration.anchorLine)
      )
    )
    .sort((a, b) => a.line - b.line || compareText(a.name, b.name));

// ---- Header -----------------------------------------------------------------------------

const hasHeaderWords = (text: string): boolean => docWords(text).length >= MIN_HEADER_WORDS;

/** Whether a comment block can be the file header: described, on top, and not a notice. */
const isHeaderBlock = (block: SourceComment[], convention: DocConvention): boolean => {
  const text = blockText(block);
  if (block[0].startLine > HEADER_MAX_START_LINE || !hasHeaderWords(text)) return false;
  if (convention.headerMarker) return block.every((c) => convention.headerMarker!.test(c.text));
  return !NOT_A_HEADER.test(text);
};

/** Tells whether the file opens with a header comment that is not the doc comment of its first declaration. */
const commentHeader = (
  comments: SourceComment[],
  declarations: RawDeclaration[],
  convention: DocConvention
): boolean => {
  const firstAnchor = Math.min(Infinity, ...declarations.map((d) => d.anchorLine));
  const index = new CommentIndex(comments.filter((c) => !c.text.startsWith('#!')));
  const attached = new Set(index.blockAbove(firstAnchor));
  return groupIntoBlocks(index.comments).some(
    (block) =>
      block[0].standalone &&
      block[0].startLine < firstAnchor &&
      (convention.headerMarker !== undefined || !attached.has(block[0])) &&
      isHeaderBlock(block, convention)
  );
};

/** Decides the header verdict of a file: `n/a` for short files, a docstring check for languages that use one, else the leading comment block. */
const headerOf = (
  parsed: ParsedFile,
  comments: SourceComment[],
  convention: DocConvention,
  lineCount: number
): HeaderStatus => {
  if (!isHeaderRequired(lineCount)) return 'n/a';
  const documented = convention.docstring
    ? hasHeaderWords(parsed.scan.moduleDocstring ?? '')
    : commentHeader(comments, parsed.scan.declarations, convention);
  return documented ? 'documented' : 'missing';
};

// ---- Entry points -----------------------------------------------------------------------

/** The result for a file left out of the measurement (test or generated): no symbols and no header verdict. */
const exemptFile = (file: string, language: string, reason: ExemptReason): FileDocumentation => ({
  file,
  language,
  exempt: true,
  exemptReason: reason,
  header: 'n/a',
  symbols: [],
  commentedOutCode: [],
  unownedTodos: [],
});

const exemptReasonOf = (file: string, text: string): ExemptReason | null => {
  if (isTestFile(file)) return 'test';
  const declarationFile = /\.d\.[cm]?ts$/.test(file);
  return declarationFile || isGeneratedPath(file) || hasGeneratedMarker(text) ? 'generated' : null;
};

const sortByLine = (raw: RawComment[]): RawComment[] =>
  [...raw].sort((a, b) => a.startLine - b.startLine || a.column - b.column);

/**
 * Measures the documentation of one source file given its text. Returns null for files in a
 * language the engine does not measure (Markdown, HTML, CSS, YAML, JSON, unknown extensions)
 * and for files that cannot be parsed. Test and generated files come back as exempt.
 */
export const analyzeDocumentationSource = async (
  file: string,
  text: string
): Promise<FileDocumentation | null> => {
  const extension = path.extname(file).toLowerCase();
  const resolved = conventionForFile(extension);
  if (!resolved) return null;
  const { language, convention } = resolved;
  const reason = exemptReasonOf(file, text);
  if (reason) return exemptFile(file, language, reason);

  const parsed = await parseSource(convention.engine, { file, extension, language, text });
  if (!parsed) return null;
  const lines = text.split(/\r?\n/);
  const comments = classifyComments(sortByLine(parsed.comments), lines);
  const index = new CommentIndex(comments);
  return {
    file,
    language,
    exempt: false,
    header: headerOf(parsed, comments, convention, lines.length),
    symbols: documentSymbols(parsed.scan.declarations, index, convention),
    commentedOutCode: findCommentedOutCode(comments),
    unownedTodos: findUnownedTodos(comments),
  };
};
