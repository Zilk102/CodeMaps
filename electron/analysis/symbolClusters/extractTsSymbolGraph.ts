import ts from 'typescript';
import { lineCountOf, MAX_SYMBOLS, MAX_USES } from './symbolGraphCommon';
import type { SymbolGraph, SymbolInfo, SymbolKind } from './types';

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

const isCallableMember = (member: ts.ClassElement): boolean =>
  ts.isMethodDeclaration(member) ||
  ts.isConstructorDeclaration(member) ||
  ts.isGetAccessorDeclaration(member) ||
  ts.isSetAccessorDeclaration(member) ||
  (ts.isPropertyDeclaration(member) && isFunctionLike(member.initializer));

const newSymbol = (
  name: string,
  kind: SymbolKind,
  node: ts.Node,
  extra: Partial<TsSymbol> = {}
): TsSymbol => ({ name, kind, node, skip: new Set(), ...extra });

const classMemberSymbols = (statement: ts.ClassDeclaration, className: string): TsSymbol[] =>
  statement.members.flatMap((member) => {
    const name = memberName(member);
    if (!name || !isCallableMember(member)) return [];
    return [newSymbol(`${className}.${name}`, 'function', member, { owner: className })];
  });

const classSymbols = (statement: ts.ClassDeclaration, className: string): TsSymbol[] => {
  const members = classMemberSymbols(statement, className);
  const skip = new Set(members.map((member) => member.node));
  return [newSymbol(className, 'class', statement, { skip }), ...members];
};

const variableSymbols = (statement: ts.VariableStatement): TsSymbol[] =>
  statement.declarationList.declarations.flatMap((declaration) =>
    ts.isIdentifier(declaration.name)
      ? [
          newSymbol(
            declaration.name.text,
            isFunctionLike(declaration.initializer) ? 'function' : 'const',
            statement
          ),
        ]
      : []
  );

const statementSymbols = (statement: ts.Statement): TsSymbol[] => {
  if (ts.isFunctionDeclaration(statement) && statement.name) {
    return [newSymbol(statement.name.text, 'function', statement)];
  }
  if (ts.isClassDeclaration(statement) && statement.name) {
    return classSymbols(statement, statement.name.text);
  }
  if (ts.isVariableStatement(statement)) return variableSymbols(statement);
  return isTypeDeclaration(statement) ? [newSymbol(statement.name.text, 'type', statement)] : [];
};

const isTypeDeclaration = (
  statement: ts.Statement
): statement is ts.InterfaceDeclaration | ts.TypeAliasDeclaration | ts.EnumDeclaration =>
  ts.isInterfaceDeclaration(statement) ||
  ts.isTypeAliasDeclaration(statement) ||
  ts.isEnumDeclaration(statement);

const collectTsSymbols = (source: ts.SourceFile): TsSymbol[] =>
  source.statements.flatMap(statementSymbols);

interface TsReferenceContext {
  /** Non-member symbols by name, the targets a bare identifier can refer to. */
  byName: Map<string, string[]>;
  names: Set<string>;
}

const buildReferenceContext = (raw: TsSymbol[]): TsReferenceContext => {
  const byName = new Map<string, string[]>();
  for (const symbol of raw) {
    if (symbol.owner) continue;
    byName.set(symbol.name, [...(byName.get(symbol.name) ?? []), symbol.name]);
  }
  return { byName, names: new Set(raw.map((symbol) => symbol.name)) };
};

/** Which other symbols a symbol refers to, and which outside names it merely uses. */
const noteUse = (uses: Set<string>, name: string) => {
  if (name.length >= 3 && uses.size < MAX_USES) uses.add(name);
};

interface UsageState {
  symbol: TsSymbol;
  context: TsReferenceContext;
  refs: Set<string>;
  uses: Set<string>;
}

const visitPropertyAccess = (state: UsageState, node: ts.PropertyAccessExpression) => {
  const { symbol, context, refs, uses } = state;
  const member = symbol.owner ? `${symbol.owner}.${node.name.text}` : undefined;
  if (member && node.expression.kind === ts.SyntaxKind.ThisKeyword) {
    if (context.names.has(member)) refs.add(member);
    else noteUse(uses, node.name.text);
    return;
  }
  noteUse(uses, node.name.text);
  visitUsage(state, node.expression);
};

const visitIdentifierUse = (state: UsageState, node: ts.Identifier) => {
  const targets = state.context.byName.get(node.text);
  if (!targets) {
    noteUse(state.uses, node.text);
    return;
  }
  for (const target of targets) state.refs.add(target);
};

const visitUsage = (state: UsageState, node: ts.Node) => {
  if (state.symbol.skip.has(node)) return;
  if (ts.isPropertyAccessExpression(node)) visitPropertyAccess(state, node);
  else if (ts.isIdentifier(node)) visitIdentifierUse(state, node);
  else ts.forEachChild(node, (child) => visitUsage(state, child));
};

const collectTsUsage = (symbol: TsSymbol, context: TsReferenceContext) => {
  const state: UsageState = { symbol, context, refs: new Set(), uses: new Set() };
  ts.forEachChild(symbol.node, (child) => visitUsage(state, child));
  state.refs.delete(symbol.name);
  return { refs: state.refs, uses: state.uses };
};

const lineOf = (source: ts.SourceFile, position: number) =>
  source.getLineAndCharacterOfPosition(position).line + 1;

/** Lines of the symbol without the lines of the child symbols it does not own. */
const ownedLines = (source: ts.SourceFile, symbol: TsSymbol, start: number, end: number) => {
  let owned = lineCountOf(start, end);
  for (const skipped of symbol.skip) {
    owned -= lineCountOf(
      lineOf(source, skipped.getStart(source)),
      lineOf(source, skipped.getEnd())
    );
  }
  return Math.max(1, owned);
};

const toSymbolInfo = (
  source: ts.SourceFile,
  symbol: TsSymbol,
  context: TsReferenceContext
): SymbolInfo => {
  const { refs, uses } = collectTsUsage(symbol, context);
  const start = lineOf(source, symbol.node.getStart(source));
  const end = lineOf(source, symbol.node.getEnd());
  return {
    name: symbol.name,
    kind: symbol.kind,
    startLine: start,
    endLine: end,
    lineCount: ownedLines(source, symbol, start, end),
    refs: [...refs],
    uses: [...uses],
  };
};

export const extractTypeScript = (filePath: string, text: string): SymbolGraph => {
  const scriptKind = /\.[cm]?jsx?$/.test(filePath) ? ts.ScriptKind.JS : undefined;
  const source = ts.createSourceFile(filePath, text, ts.ScriptTarget.Latest, true, scriptKind);
  const raw = collectTsSymbols(source);
  const context = buildReferenceContext(raw);
  const symbols = raw.slice(0, MAX_SYMBOLS).map((symbol) => toSymbolInfo(source, symbol, context));
  return {
    filePath,
    language: 'typescript',
    lineCount: lineOf(source, source.getEnd()),
    symbols,
  };
};
