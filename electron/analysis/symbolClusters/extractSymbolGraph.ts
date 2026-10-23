import * as fs from 'fs/promises';
import * as path from 'path';
import ts from 'typescript';
import { Query, type Node } from 'web-tree-sitter';
import { MAX_ANALYZED_FILE_SIZE } from '../../parsing/fileLimits';
import { extractLanguageFactsWithDeclarations, hasLanguageFacts } from '../../parsing/facts';
import { namedOf, walkNamed } from '../../parsing/facts/astUtils';
import type { DeclarationNode } from '../../parsing/facts/types';
import { getLanguageByExtension } from '../../parsing/languageRegistry';
import { getParserInstance, loadTreeSitterLanguage } from '../../parsing/treeSitterRuntime';
import type { SymbolGraph, SymbolInfo, SymbolKind } from './types';

const MAX_SYMBOLS = 800;
/** A name shared by more than this many symbols (`new`, `get`) says nothing about who uses it. */
const MAX_AMBIGUOUS_TARGETS = 2;
const MAX_USES = 80;

const TS_EXTENSIONS = new Set(['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs', '.mts', '.cts']);

const simpleName = (name: string) => name.split(/[.:]+/).filter(Boolean).pop() ?? name;

const lineCountOf = (startLine: number, endLine: number) => Math.max(1, endLine - startLine + 1);

// ---- TypeScript / JavaScript ------------------------------------------------------------

interface TsSymbol {
  name: string;
  kind: SymbolKind;
  node: ts.Node;
  owner?: string;
  /** Child symbol nodes whose lines this symbol does not own. */
  skip: Set<ts.Node>;
}

const memberName = (member: ts.ClassElement): string | null => {
  if (ts.isConstructorDeclaration(member)) return 'constructor';
  const name = (member as ts.ClassElement & { name?: ts.PropertyName }).name;
  return name && (ts.isIdentifier(name) || ts.isStringLiteral(name)) ? name.text : null;
};

const isFunctionLike = (node: ts.Node | undefined): boolean =>
  !!node && (ts.isArrowFunction(node) || ts.isFunctionExpression(node));

const collectTsSymbols = (source: ts.SourceFile): TsSymbol[] => {
  const symbols: TsSymbol[] = [];
  for (const statement of source.statements) {
    if (ts.isFunctionDeclaration(statement) && statement.name) {
      symbols.push({
        name: statement.name.text,
        kind: 'function',
        node: statement,
        skip: new Set(),
      });
    } else if (ts.isClassDeclaration(statement) && statement.name) {
      const className = statement.name.text;
      const members: TsSymbol[] = [];
      for (const member of statement.members) {
        const name = memberName(member);
        const isCallable =
          ts.isMethodDeclaration(member) ||
          ts.isConstructorDeclaration(member) ||
          ts.isGetAccessorDeclaration(member) ||
          ts.isSetAccessorDeclaration(member) ||
          (ts.isPropertyDeclaration(member) && isFunctionLike(member.initializer));
        if (name && isCallable) {
          members.push({
            name: `${className}.${name}`,
            kind: 'function',
            node: member,
            owner: className,
            skip: new Set(),
          });
        }
      }
      symbols.push({
        name: className,
        kind: 'class',
        node: statement,
        skip: new Set(members.map((member) => member.node)),
      });
      symbols.push(...members);
    } else if (ts.isVariableStatement(statement)) {
      for (const declaration of statement.declarationList.declarations) {
        if (!ts.isIdentifier(declaration.name)) continue;
        symbols.push({
          name: declaration.name.text,
          kind: isFunctionLike(declaration.initializer) ? 'function' : 'const',
          node: statement,
          skip: new Set(),
        });
      }
    } else if (
      ts.isInterfaceDeclaration(statement) ||
      ts.isTypeAliasDeclaration(statement) ||
      ts.isEnumDeclaration(statement)
    ) {
      symbols.push({ name: statement.name.text, kind: 'type', node: statement, skip: new Set() });
    }
  }
  return symbols;
};

const extractTypeScript = (filePath: string, text: string): SymbolGraph => {
  const scriptKind = /\.[cm]?jsx?$/.test(filePath) ? ts.ScriptKind.JS : undefined;
  const source = ts.createSourceFile(filePath, text, ts.ScriptTarget.Latest, true, scriptKind);
  const raw = collectTsSymbols(source);
  const byName = new Map<string, string[]>();
  for (const symbol of raw) {
    if (symbol.owner) continue;
    byName.set(symbol.name, [...(byName.get(symbol.name) ?? []), symbol.name]);
  }
  const names = new Set(raw.map((symbol) => symbol.name));

  const symbols: SymbolInfo[] = raw.slice(0, MAX_SYMBOLS).map((symbol) => {
    const refs = new Set<string>();
    const uses = new Set<string>();
    const noteUse = (name: string) => {
      if (name.length >= 3 && uses.size < MAX_USES) uses.add(name);
    };
    const visit = (node: ts.Node) => {
      if (symbol.skip.has(node)) return;
      if (ts.isPropertyAccessExpression(node)) {
        if (node.expression.kind === ts.SyntaxKind.ThisKeyword && symbol.owner) {
          const member = `${symbol.owner}.${node.name.text}`;
          if (names.has(member)) refs.add(member);
          else noteUse(node.name.text);
          return;
        }
        noteUse(node.name.text);
        visit(node.expression);
        return;
      }
      if (ts.isIdentifier(node)) {
        const targets = byName.get(node.text);
        if (targets) for (const target of targets) refs.add(target);
        else noteUse(node.text);
        return;
      }
      ts.forEachChild(node, visit);
    };
    ts.forEachChild(symbol.node, visit);
    refs.delete(symbol.name);

    const start = source.getLineAndCharacterOfPosition(symbol.node.getStart(source)).line + 1;
    const end = source.getLineAndCharacterOfPosition(symbol.node.getEnd()).line + 1;
    let owned = lineCountOf(start, end);
    for (const skipped of symbol.skip) {
      const innerStart = source.getLineAndCharacterOfPosition(skipped.getStart(source)).line + 1;
      const innerEnd = source.getLineAndCharacterOfPosition(skipped.getEnd()).line + 1;
      owned -= lineCountOf(innerStart, innerEnd);
    }
    return {
      name: symbol.name,
      kind: symbol.kind,
      startLine: start,
      endLine: end,
      lineCount: Math.max(1, owned),
      refs: [...refs],
      uses: [...uses],
    };
  });

  return {
    filePath,
    language: 'typescript',
    lineCount: source.getLineAndCharacterOfPosition(source.getEnd()).line + 1,
    symbols,
  };
};

// ---- Tree-sitter languages --------------------------------------------------------------

const nodeLines = (node: Node) => ({
  start: node.startPosition.row + 1,
  end: node.endPosition.row + 1,
});

const declarationsFromQuery = (query: Query, root: Node): DeclarationNode[] => {
  const seen = new Set<string>();
  const result: DeclarationNode[] = [];
  for (const match of query.matches(root)) {
    for (const capture of match.captures) {
      if (capture.name !== 'class' && capture.name !== 'function') continue;
      const type = capture.name;
      const name = capture.node.text.trim();
      const key = `${type}:${name}`;
      if (!name || seen.has(key)) continue;
      seen.add(key);
      result.push({ type, name, node: capture.node.parent ?? capture.node });
    }
  }
  return result;
};

interface Declaration {
  name: string;
  kind: SymbolKind;
  node: Node;
}

/** Top-level statements that are not imports or comments. */
const NON_DECLARATION_TOP_LEVEL =
  /import|^use_declaration$|package|comment|include|using|namespace|^mod_item$|^extern_crate/;
const MIN_DATA_BLOCK_LINES = 6;

/**
 * Large module-level statements (lookup tables, config dictionaries, constant blocks) that no
 * function or class declaration covers: they are most of some "god files" and move as a unit.
 */
const dataBlocks = (root: Node, declarations: Declaration[]): Declaration[] => {
  const covered = declarations.map((declaration) => nodeLines(declaration.node));
  const taken = new Set(declarations.map((declaration) => declaration.name));
  const blocks: Declaration[] = [];
  for (const child of namedOf(root)) {
    if (NON_DECLARATION_TOP_LEVEL.test(child.type)) continue;
    const { start, end } = nodeLines(child);
    if (lineCountOf(start, end) < MIN_DATA_BLOCK_LINES) continue;
    // Already a declaration, or a wrapper around one (a decorated Python class).
    if (
      covered.some(
        (range) =>
          (range.start <= start && end <= range.end) || (start <= range.start && range.end <= end)
      )
    ) {
      continue;
    }
    let label = '';
    walkNamed(child, (node) => {
      if (label) return false;
      if (node.childCount === 0 && /identifier/.test(node.type)) label = node.text;
      return true;
    });
    let name = label || `block_${start}`;
    for (let suffix = 2; taken.has(name); suffix += 1) name = `${label || 'block'}_${suffix}`;
    taken.add(name);
    blocks.push({ name, kind: 'const', node: child });
  }
  return blocks;
};

const buildFromDeclarations = (
  filePath: string,
  language: string,
  root: Node,
  declarations: DeclarationNode[]
): SymbolGraph => {
  const base: Declaration[] = declarations.slice(0, MAX_SYMBOLS).map((declaration) => ({
    name: declaration.name,
    kind: declaration.type === 'class' ? 'class' : 'function',
    node: declaration.node,
  }));
  const limited = [...base, ...dataBlocks(root, base)];
  const declarationIds = new Set(limited.map((declaration) => declaration.node.id));

  const bySimpleName = new Map<string, string[]>();
  for (const declaration of limited) {
    const key = simpleName(declaration.name);
    bySimpleName.set(key, [...(bySimpleName.get(key) ?? []), declaration.name]);
  }

  const symbols = limited.map((declaration): SymbolInfo => {
    const refs = new Set<string>();
    const uses = new Set<string>();
    let nestedLines = 0;
    walkNamed(declaration.node, (node) => {
      if (node.id !== declaration.node.id && declarationIds.has(node.id)) {
        const { start, end } = nodeLines(node);
        nestedLines += lineCountOf(start, end);
        return false;
      }
      if (node.childCount === 0 && /identifier/.test(node.type)) {
        const targets = bySimpleName.get(node.text);
        if (targets && targets.length <= MAX_AMBIGUOUS_TARGETS) {
          for (const target of targets) refs.add(target);
        } else if (!targets && node.text.length >= 3 && uses.size < MAX_USES) {
          uses.add(node.text);
        }
      }
      return true;
    });
    refs.delete(declaration.name);
    const { start, end } = nodeLines(declaration.node);
    return {
      name: declaration.name,
      kind: declaration.kind,
      startLine: start,
      endLine: end,
      lineCount: Math.max(1, lineCountOf(start, end) - nestedLines),
      refs: [...refs],
      uses: [...uses],
    };
  });

  return { filePath, language, lineCount: root.endPosition.row + 1, symbols };
};

const extractWithTreeSitter = async (
  filePath: string,
  text: string,
  extension: string
): Promise<SymbolGraph | null> => {
  const definition = getLanguageByExtension(extension);
  if (!definition || definition.parserEngine !== 'tree-sitter' || !definition.query) return null;
  const language = await loadTreeSitterLanguage(definition);
  if (!language) return null;

  const parser = await getParserInstance();
  parser.setLanguage(language);
  const tree = parser.parse(text);
  if (!tree) return null;

  const withDeclarations = hasLanguageFacts(definition.id)
    ? extractLanguageFactsWithDeclarations(definition.id, tree.rootNode)?.declarations
    : undefined;
  const declarations =
    withDeclarations ?? declarationsFromQuery(new Query(language, definition.query), tree.rootNode);
  return buildFromDeclarations(filePath, definition.id, tree.rootNode, declarations);
};

/**
 * Reads one source file and returns its declarations with which of them use which, or null
 * when the language is not supported or the file is too large to read.
 */
export const extractSymbolGraph = async (filePath: string): Promise<SymbolGraph | null> => {
  const extension = path.extname(filePath).toLowerCase();
  const stat = await fs.stat(filePath).catch(() => null);
  if (!stat || stat.size > MAX_ANALYZED_FILE_SIZE) return null;
  const text = await fs.readFile(filePath, 'utf-8');

  if (TS_EXTENSIONS.has(extension)) return extractTypeScript(filePath, text);
  return extractWithTreeSitter(filePath, text, extension);
};
