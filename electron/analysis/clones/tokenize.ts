import * as fs from 'fs/promises';
import * as path from 'path';
import ts from 'typescript';
import type { Node } from 'web-tree-sitter';
import { getLanguageByExtension } from '../../parsing/languageRegistry';
import { getParserInstance, loadTreeSitterLanguage } from '../../parsing/treeSitterRuntime';

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
const TS_EXTENSIONS = new Set(['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs', '.mts', '.cts']);

// Imports, package headers and comments are the same in every file; they are not duplication.
const SKIPPED_NODE =
  /comment|^(import_declaration|import_statement|import_from_statement|future_import_statement|use_declaration|package_clause|package_declaration|preproc_include|using_directive|namespace_use_declaration|extern_crate_declaration)$/;
const STRING_NODE =
  /string|^(char_literal|rune_literal|raw_string_literal|interpreted_string_literal)$/;
const NUMBER_NODE =
  /^(number|integer|float|int_literal|float_literal|integer_literal|decimal_integer_literal|hex_integer_literal|decimal_floating_point_literal|imaginary_literal|rune)$/;

// ---- TypeScript / JavaScript ------------------------------------------------------------

const normalizeTsToken = (kind: ts.SyntaxKind): string | null => {
  switch (kind) {
    case ts.SyntaxKind.Identifier:
    case ts.SyntaxKind.PrivateIdentifier:
      return 'ID';
    case ts.SyntaxKind.NumericLiteral:
    case ts.SyntaxKind.BigIntLiteral:
      return 'NUM';
    case ts.SyntaxKind.StringLiteral:
    case ts.SyntaxKind.NoSubstitutionTemplateLiteral:
    case ts.SyntaxKind.TemplateHead:
    case ts.SyntaxKind.TemplateMiddle:
    case ts.SyntaxKind.TemplateTail:
    case ts.SyntaxKind.RegularExpressionLiteral:
      return 'STR';
    case ts.SyntaxKind.JsxText:
    case ts.SyntaxKind.JsxTextAllWhiteSpaces:
      return null;
    default:
      return ts.tokenToString(kind) ?? ts.SyntaxKind[kind];
  }
};

/**
 * The scanner does not know it is inside a template literal: after `${` the closing `}` has to be
 * re-scanned as the next template part, or the rest of the file would read as one string.
 */
const createTemplateTracker = (scanner: ts.Scanner) => {
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

const tokenizeTypeScript = (filePath: string, text: string): TextTokenStream => {
  const isJsx = /\.[cm]?[jt]sx$/.test(filePath) || /\.[cm]?js$/.test(filePath);
  const source = ts.createSourceFile(filePath, text, ts.ScriptTarget.Latest, false);
  const skipped = source.statements
    .filter(
      (statement) =>
        ts.isImportDeclaration(statement) ||
        (ts.isExportDeclaration(statement) && !!statement.moduleSpecifier)
    )
    .map((statement) => [statement.getStart(source), statement.getEnd()] as const);

  const scanner = ts.createScanner(
    ts.ScriptTarget.Latest,
    true,
    isJsx ? ts.LanguageVariant.JSX : ts.LanguageVariant.Standard,
    text
  );
  const tokens: string[] = [];
  const lines: number[] = [];
  const texts: string[] = [];
  const trackTemplates = createTemplateTracker(scanner);
  let skipIndex = 0;
  for (let kind = scanner.scan(); kind !== ts.SyntaxKind.EndOfFileToken; kind = scanner.scan()) {
    kind = trackTemplates(kind);
    const start = scanner.getTokenStart();
    while (skipIndex < skipped.length && skipped[skipIndex][1] <= start) skipIndex += 1;
    if (skipIndex < skipped.length && start >= skipped[skipIndex][0]) continue;
    const normalized = normalizeTsToken(kind);
    if (!normalized) continue;
    tokens.push(normalized);
    lines.push(source.getLineAndCharacterOfPosition(start).line + 1);
    texts.push(scanner.getTokenText());
  }
  return { file: filePath, tokens, lines, texts };
};

// ---- Tree-sitter languages --------------------------------------------------------------

const tokenizeTree = (filePath: string, root: Node): TextTokenStream => {
  const tokens: string[] = [];
  const lines: number[] = [];
  const texts: string[] = [];
  const push = (token: string, node: Node) => {
    tokens.push(token);
    lines.push(node.startPosition.row + 1);
    texts.push(node.text);
  };

  const stack: Node[] = [root];
  while (stack.length > 0) {
    const node = stack.pop()!;
    if (SKIPPED_NODE.test(node.type)) continue;
    if (node.isNamed && STRING_NODE.test(node.type)) {
      push('STR', node);
      continue;
    }
    if (node.isNamed && NUMBER_NODE.test(node.type)) {
      push('NUM', node);
      continue;
    }
    if (node.childCount === 0) {
      if (!node.isNamed) push(node.text, node);
      else push(/identifier|^name$/.test(node.type) ? 'ID' : node.type, node);
      continue;
    }
    for (let index = node.childCount - 1; index >= 0; index -= 1) {
      const child = node.child(index);
      if (child) stack.push(child);
    }
  }
  return { file: filePath, tokens, lines, texts };
};

/** Tokenizes one file, or returns null when the language is unsupported or the file is huge. */
const tokenizeWithText = async (filePath: string): Promise<TextTokenStream | null> => {
  const extension = path.extname(filePath).toLowerCase();
  const stat = await fs.stat(filePath).catch(() => null);
  if (!stat || stat.size > MAX_FILE_BYTES) return null;
  const text = await fs.readFile(filePath, 'utf-8');

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
