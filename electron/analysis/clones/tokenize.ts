// Turns source files of any supported language into normalized token streams for clone detection.

import ts from 'typescript';
import type { Node } from 'web-tree-sitter';
import { getLanguageByExtension } from '../../parsing/languageRegistry';
import { getParserInstance, loadTreeSitterLanguage } from '../../parsing/treeSitterRuntime';
import { readSourceText, TS_EXTENSIONS } from '../sourceText';

/** A source file as a sequence of normalized tokens with the line each one starts on. */
export interface TokenStream {
  file: string;
  tokens: string[];
  lines: number[];
}

/** A token stream that also keeps the source text of every token, for explaining differences. */
export interface TextTokenStream extends TokenStream {
  texts: string[];
}

const MAX_FILE_BYTES = 400_000;

// Imports, package headers and comments are the same in every file; they are not duplication.
const SKIPPED_NODE =
  /comment|^(import_declaration|import_statement|import_from_statement|future_import_statement|use_declaration|package_clause|package_declaration|preproc_include|using_directive|namespace_use_declaration|extern_crate_declaration)$/;
const STRING_NODE =
  /string|^(char_literal|rune_literal|raw_string_literal|interpreted_string_literal)$/;
const NUMBER_NODE =
  /^(number|integer|float|int_literal|float_literal|integer_literal|decimal_integer_literal|hex_integer_literal|decimal_floating_point_literal|imaginary_literal|rune)$/;

// ---- TypeScript / JavaScript ------------------------------------------------------------

/** Token kinds that stand for a class of tokens; null drops the token. */
const TS_TOKEN_CLASSES = new Map<ts.SyntaxKind, string | null>([
  [ts.SyntaxKind.Identifier, 'ID'],
  [ts.SyntaxKind.PrivateIdentifier, 'ID'],
  [ts.SyntaxKind.NumericLiteral, 'NUM'],
  [ts.SyntaxKind.BigIntLiteral, 'NUM'],
  [ts.SyntaxKind.StringLiteral, 'STR'],
  [ts.SyntaxKind.NoSubstitutionTemplateLiteral, 'STR'],
  [ts.SyntaxKind.TemplateHead, 'STR'],
  [ts.SyntaxKind.TemplateMiddle, 'STR'],
  [ts.SyntaxKind.TemplateTail, 'STR'],
  [ts.SyntaxKind.RegularExpressionLiteral, 'STR'],
  [ts.SyntaxKind.JsxText, null],
  [ts.SyntaxKind.JsxTextAllWhiteSpaces, null],
]);

const normalizeTsToken = (kind: ts.SyntaxKind): string | null =>
  TS_TOKEN_CLASSES.has(kind)
    ? (TS_TOKEN_CLASSES.get(kind) ?? null)
    : (ts.tokenToString(kind) ?? ts.SyntaxKind[kind]);

/**
 * The scanner does not know it is inside a template literal: after `${` the closing `}` has to be
 * re-scanned as the next template part, or the rest of the file would read as one string.
 */
export const createTemplateTracker = (scanner: ts.Scanner) => {
  const openBraces: number[] = [];
  return (kind: ts.SyntaxKind): ts.SyntaxKind => {
    if (kind === ts.SyntaxKind.TemplateHead) openBraces.push(0);
    if (openBraces.length === 0) return kind;
    const last = openBraces.length - 1;
    if (kind === ts.SyntaxKind.OpenBraceToken) openBraces[last] += 1;
    if (kind !== ts.SyntaxKind.CloseBraceToken) return kind;
    if (openBraces[last] > 0) {
      openBraces[last] -= 1;
      return kind;
    }
    const part = scanner.reScanTemplateToken(false);
    if (part === ts.SyntaxKind.TemplateTail) openBraces.pop();
    return part;
  };
};

/** Source ranges of imports and re-exports, which are the same in every file. */
const skippedRanges = (source: ts.SourceFile) =>
  source.statements
    .filter(
      (statement) =>
        ts.isImportDeclaration(statement) ||
        (ts.isExportDeclaration(statement) && !!statement.moduleSpecifier)
    )
    .map((statement) => [statement.getStart(source), statement.getEnd()] as const);

const isJsxFile = (filePath: string) =>
  /\.[cm]?[jt]sx$/.test(filePath) || /\.[cm]?js$/.test(filePath);

/**
 * Scans TypeScript or JavaScript with the compiler scanner (no full parse) and skips imports and
 * re-exports.
 */
const tokenizeTypeScript = (filePath: string, text: string): TextTokenStream => {
  const source = ts.createSourceFile(filePath, text, ts.ScriptTarget.Latest, false);
  const skipped = skippedRanges(source);
  const scanner = ts.createScanner(
    ts.ScriptTarget.Latest,
    true,
    isJsxFile(filePath) ? ts.LanguageVariant.JSX : ts.LanguageVariant.Standard,
    text
  );
  const stream: TextTokenStream = { file: filePath, tokens: [], lines: [], texts: [] };
  const trackTemplates = createTemplateTracker(scanner);
  let skipIndex = 0;
  for (let kind = scanner.scan(); kind !== ts.SyntaxKind.EndOfFileToken; kind = scanner.scan()) {
    kind = trackTemplates(kind);
    const start = scanner.getTokenStart();
    while (skipIndex < skipped.length && skipped[skipIndex][1] <= start) skipIndex += 1;
    if (skipIndex < skipped.length && start >= skipped[skipIndex][0]) continue;
    const normalized = normalizeTsToken(kind);
    if (!normalized) continue;
    stream.tokens.push(normalized);
    stream.lines.push(source.getLineAndCharacterOfPosition(start).line + 1);
    stream.texts.push(scanner.getTokenText());
  }
  return stream;
};

// ---- Tree-sitter languages --------------------------------------------------------------

/** The single token a leaf or a literal node stands for, or null when it has children to walk. */
const leafToken = (node: Node): string | null => {
  if (node.isNamed && STRING_NODE.test(node.type)) return 'STR';
  if (node.isNamed && NUMBER_NODE.test(node.type)) return 'NUM';
  if (node.childCount > 0) return null;
  if (!node.isNamed) return node.text;
  return /identifier|^name$/.test(node.type) ? 'ID' : node.type;
};

/** Children of a node in source order, pushed so the stack pops the first child first. */
const pushChildrenReversed = (stack: Node[], node: Node): void => {
  for (let index = node.childCount - 1; index >= 0; index -= 1) {
    const child = node.child(index);
    if (child) stack.push(child);
  }
};

/**
 * Walks the syntax tree depth first, emitting one token per leaf or literal and skipping comments
 * and import-like nodes.
 */
const tokenizeTree = (filePath: string, root: Node): TextTokenStream => {
  const stream: TextTokenStream = { file: filePath, tokens: [], lines: [], texts: [] };
  const stack: Node[] = [root];
  while (stack.length > 0) {
    const node = stack.pop()!;
    if (SKIPPED_NODE.test(node.type)) continue;
    const token = leafToken(node);
    if (token === null) {
      pushChildrenReversed(stack, node);
      continue;
    }
    stream.tokens.push(token);
    stream.lines.push(node.startPosition.row + 1);
    stream.texts.push(node.text);
  }
  return stream;
};

/**
 * Reads and tokenizes a file with the right tokenizer. Returns null for oversized, unreadable or
 * unsupported files.
 */
const tokenizeWithText = async (filePath: string): Promise<TextTokenStream | null> => {
  const source = await readSourceText(filePath, MAX_FILE_BYTES);
  if (!source) return null;
  const { extension, text } = source;

  if (TS_EXTENSIONS.has(extension)) return tokenizeTypeScript(filePath, text);

  const definition = getLanguageByExtension(extension);
  if (!definition || definition.parserEngine !== 'tree-sitter' || !definition.wasmName) return null;
  const language = await loadTreeSitterLanguage(definition);
  if (!language) return null;
  const parser = await getParserInstance();
  parser.setLanguage(language);
  const tree = parser.parse(text);
  return tree ? tokenizeTree(filePath, tree.rootNode) : null;
};

/** Tokenizes one file, or returns null when the language is unsupported or the file is huge. */
export const tokenizeFile = async (filePath: string): Promise<TokenStream | null> => {
  const stream = await tokenizeWithText(filePath);
  return stream ? { file: stream.file, tokens: stream.tokens, lines: stream.lines } : null;
};

/** Like `tokenizeFile`, plus the raw text of each token (names, numbers and strings intact). */
export const tokenizeFileWithText = tokenizeWithText;
