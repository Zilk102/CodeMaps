/**
 * Non-class declarations for the TypeScript scanner: functions, interfaces, type aliases, enums
 * and variables bound to function values.
 */
import ts from 'typescript';
import type { SymbolKind } from './types';
import {
  isExportedStatement,
  nameOf,
  record,
  type Collector,
} from './declarationsTypeScriptShared';

/** Records a function declaration; bodiless overload signatures are skipped. */
export const addFunction = (collector: Collector, declaration: ts.FunctionDeclaration): void => {
  if (!declaration.body) return;
  const name = nameOf(declaration, collector.source);
  const exported = isExportedStatement(collector, declaration, name);
  record(collector, { node: declaration, name, kind: 'function', exported });
};

/** Records an interface, type alias or enum under the given kind. */
export const addNamed = (
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
export const addVariables = (collector: Collector, statement: ts.VariableStatement): void => {
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
