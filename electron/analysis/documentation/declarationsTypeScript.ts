/**
 * Collects the documentable declarations of a TypeScript, TSX or JavaScript file with the
 * TypeScript compiler API: functions, classes and their methods, interfaces, type aliases, enums
 * and arrow functions bound to a variable.
 */
import ts from 'typescript';
import type { RawDeclaration } from './declarations';
import type { SymbolKind } from './types';

interface Collector {
  source: ts.SourceFile;
  /** Names exported through `export { a }`, `export default a` or `module.exports`. */
  exportedNames: Set<string>;
  out: RawDeclaration[];
}

type Statement = ts.Statement;

const modifiersOf = (node: ts.Node): readonly ts.Modifier[] =>
  (ts.canHaveModifiers(node) ? ts.getModifiers(node) : undefined) ?? [];

const hasModifier = (node: ts.Node, kind: ts.SyntaxKind): boolean =>
  modifiersOf(node).some((modifier) => modifier.kind === kind);

const lineOf = (source: ts.SourceFile, position: number): number =>
  source.getLineAndCharacterOfPosition(position).line + 1;

interface Described {
  node: ts.Node;
  name: string;
  kind: SymbolKind;
  exported: boolean;
  exempt?: boolean;
  /** The node whose start the doc comment sits above, when it is not the node itself. */
  anchor?: ts.Node;
}

/** Appends a declaration to the collector with its line span and the anchor line its doc comment must precede. */
const record = (collector: Collector, described: Described): void => {
  const { source, out } = collector;
  const start = described.node.getStart(source);
  out.push({
    name: described.name,
    kind: described.kind,
    line: lineOf(source, start),
    endLine: lineOf(source, described.node.getEnd()),
    anchorLine: lineOf(source, (described.anchor ?? described.node).getStart(source)),
    exported: described.exported,
    exempt: described.exempt ?? false,
  });
};

const nameOf = (node: { name?: ts.Node }, source: ts.SourceFile): string =>
  node.name ? node.name.getText(source) : 'default';

const isExportedStatement = (collector: Collector, node: ts.Node, name: string): boolean =>
  hasModifier(node, ts.SyntaxKind.ExportKeyword) || collector.exportedNames.has(name);

// ---- Classes ----------------------------------------------------------------------------

const isHiddenMember = (member: ts.ClassElement): boolean =>
  hasModifier(member, ts.SyntaxKind.PrivateKeyword) ||
  hasModifier(member, ts.SyntaxKind.ProtectedKeyword) ||
  (!!member.name && ts.isPrivateIdentifier(member.name));

/** A method with a body, or an abstract one; the bodiless rest are overload signatures. */
const isDocumentableMethod = (member: ts.ClassElement): member is ts.MethodDeclaration =>
  ts.isMethodDeclaration(member) &&
  (!!member.body || hasModifier(member, ts.SyntaxKind.AbstractKeyword));

/** Adds the methods of a class as declarations; a method is public when the class is exported and the method has no private or protected modifier. */
const addClassMembers = (
  collector: Collector,
  declaration: ts.ClassDeclaration,
  classExported: boolean
): void => {
  for (const member of declaration.members.filter(isDocumentableMethod)) {
    record(collector, {
      node: member,
      name: nameOf(member, collector.source),
      kind: 'method',
      exported: classExported && !isHiddenMember(member),
      exempt: hasModifier(member, ts.SyntaxKind.OverrideKeyword),
    });
  }
};

const addClass = (collector: Collector, declaration: ts.ClassDeclaration): void => {
  const name = nameOf(declaration, collector.source);
  const exported = isExportedStatement(collector, declaration, name);
  record(collector, { node: declaration, name, kind: 'class', exported });
  addClassMembers(collector, declaration, exported);
};

// ---- Other statements -------------------------------------------------------------------

const addFunction = (collector: Collector, declaration: ts.FunctionDeclaration): void => {
  if (!declaration.body) return;
  const name = nameOf(declaration, collector.source);
  const exported = isExportedStatement(collector, declaration, name);
  record(collector, { node: declaration, name, kind: 'function', exported });
};

const addNamed = (
  collector: Collector,
  node: ts.InterfaceDeclaration | ts.TypeAliasDeclaration | ts.EnumDeclaration,
  kind: SymbolKind
): void => {
  const name = nameOf(node, collector.source);
  record(collector, { node, name, kind, exported: isExportedStatement(collector, node, name) });
};

const isFunctionValue = (node: ts.Expression | undefined): boolean =>
  !!node && (ts.isArrowFunction(node) || ts.isFunctionExpression(node));

/** Adds `const f = () => {}` style declarations as functions; a variable counts only when its initializer is a function value. */
const addVariables = (collector: Collector, statement: ts.VariableStatement): void => {
  statement.declarationList.declarations.forEach((declaration, index) => {
    if (!ts.isIdentifier(declaration.name) || !isFunctionValue(declaration.initializer)) return;
    const name = declaration.name.text;
    record(collector, {
      node: declaration,
      name,
      kind: 'function',
      exported: isExportedStatement(collector, statement, name),
      anchor: index === 0 ? statement : declaration,
    });
  });
};

const addNamespace = (collector: Collector, declaration: ts.ModuleDeclaration): void => {
  const body = declaration.body;
  if (body && ts.isModuleBlock(body)) visitStatements(collector, body.statements);
};

type StatementHandler = (collector: Collector, statement: never) => void;

// First matching predicate wins; each handler receives the statement narrowed by its predicate.
const HANDLERS: [(statement: Statement) => boolean, StatementHandler][] = [
  [ts.isFunctionDeclaration, addFunction],
  [ts.isClassDeclaration, addClass],
  [ts.isInterfaceDeclaration, (c, s: ts.InterfaceDeclaration) => addNamed(c, s, 'interface')],
  [ts.isTypeAliasDeclaration, (c, s: ts.TypeAliasDeclaration) => addNamed(c, s, 'type')],
  [ts.isEnumDeclaration, (c, s: ts.EnumDeclaration) => addNamed(c, s, 'enum')],
  [ts.isVariableStatement, addVariables],
  [ts.isModuleDeclaration, addNamespace],
];

const visitStatements = (collector: Collector, statements: readonly Statement[]): void => {
  for (const statement of statements) {
    const handler = HANDLERS.find(([matches]) => matches(statement));
    if (handler) (handler[1] as (c: Collector, s: Statement) => void)(collector, statement);
  }
};

// ---- Export lists -----------------------------------------------------------------------

const namesOfExportList = (statement: ts.ExportDeclaration): string[] => {
  const clause = statement.exportClause;
  if (statement.moduleSpecifier || !clause || !ts.isNamedExports(clause)) return [];
  return clause.elements.map((element) => (element.propertyName ?? element.name).text);
};

const isModuleExports = (node: ts.Expression): boolean =>
  ts.isPropertyAccessExpression(node) &&
  ts.isIdentifier(node.expression) &&
  node.expression.text === 'module' &&
  node.name.text === 'exports';

/** Names exported through CommonJS `module.exports = name` or `module.exports = { a, b }`; other shapes export nothing we can name. */
const namesOfCommonJs = (statement: Statement): string[] => {
  if (!ts.isExpressionStatement(statement)) return [];
  const expression = statement.expression;
  if (!ts.isBinaryExpression(expression) || !isModuleExports(expression.left)) return [];
  const value = expression.right;
  if (ts.isIdentifier(value)) return [value.text];
  if (!ts.isObjectLiteralExpression(value)) return [];
  return value.properties.flatMap((property) =>
    ts.isShorthandPropertyAssignment(property) ? [property.name.text] : []
  );
};

const namesOfDefaultExport = (statement: Statement): string[] =>
  ts.isExportAssignment(statement) && ts.isIdentifier(statement.expression)
    ? [statement.expression.text]
    : [];

/** Gathers the names a file exports without an `export` keyword on the declaration: export lists, CommonJS assignments and default exports. */
const collectExportedNames = (source: ts.SourceFile): Set<string> => {
  const names = new Set<string>();
  for (const statement of source.statements) {
    const listed = ts.isExportDeclaration(statement) ? namesOfExportList(statement) : [];
    for (const name of [
      ...listed,
      ...namesOfCommonJs(statement),
      ...namesOfDefaultExport(statement),
    ]) {
      names.add(name);
    }
  }
  return names;
};

/** The documentable declarations of a TypeScript or JavaScript source file, in source order. */
export const scanTypeScriptDeclarations = (source: ts.SourceFile): RawDeclaration[] => {
  const collector: Collector = {
    source,
    exportedNames: collectExportedNames(source),
    out: [],
  };
  visitStatements(collector, source.statements);
  return collector.out;
};
