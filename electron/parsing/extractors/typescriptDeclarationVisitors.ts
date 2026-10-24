// AST visitors that collect declarations from TypeScript and JavaScript: functions, methods, types,
// variables and properties, plus the exports they carry.

import ts from 'typescript';
import type { NodeVisitor } from './typescriptImportExportVisitors';

/**
 * Text of a declaration name: the literal text for identifiers and string or number keys, the raw
 * source for computed or destructured names.
 */
const getPropertyNameText = (name: ts.PropertyName | ts.BindingName) => {
  if (
    ts.isIdentifier(name) ||
    ts.isPrivateIdentifier(name) ||
    ts.isStringLiteral(name) ||
    ts.isNumericLiteral(name)
  ) {
    return name.text;
  }
  return name.getText();
};

const isFunctionLikeInitializer = (initializer?: ts.Expression) =>
  !!initializer && (ts.isArrowFunction(initializer) || ts.isFunctionExpression(initializer));

const visitFunctionDeclaration: NodeVisitor = (node, state) => {
  if (!ts.isFunctionDeclaration(node)) return false;
  state.addEntity('function', node, node.name?.text);
  state.registerDeclarationExport(node, node.name?.text);
  return true;
};

/**
 * Records methods, method signatures and accessors as function entities. Does not mark them as
 * exports.
 */
const visitMethodLike: NodeVisitor = (node, state) => {
  if (
    !ts.isMethodDeclaration(node) &&
    !ts.isMethodSignature(node) &&
    !ts.isGetAccessorDeclaration(node) &&
    !ts.isSetAccessorDeclaration(node)
  ) {
    return false;
  }
  state.addEntity('function', node, getPropertyNameText(node.name));
  return true;
};

/**
 * Records classes, interfaces, enums and type aliases as `class` entities, and as exports when they
 * carry an `export` modifier.
 */
const visitTypeDeclaration: NodeVisitor = (node, state) => {
  if (
    !ts.isClassDeclaration(node) &&
    !ts.isInterfaceDeclaration(node) &&
    !ts.isEnumDeclaration(node) &&
    !ts.isTypeAliasDeclaration(node)
  ) {
    return false;
  }
  state.addEntity('class', node, node.name?.text);
  state.registerDeclarationExport(node, node.name?.text);
  return true;
};

/**
 * Records a variable name; one initialised with an arrow or function expression is also a function
 * entity. Registers the export of the enclosing statement when it has the `export` modifier.
 */
const visitVariableDeclaration: NodeVisitor = (node, state) => {
  if (!ts.isVariableDeclaration(node)) return false;
  const variableName = node.name.getText(state.sourceFile).trim();
  if (variableName) state.variables.add(variableName);
  if (ts.isIdentifier(node.name) && isFunctionLikeInitializer(node.initializer)) {
    state.addEntity('function', node, node.name.text);
  }
  if (ts.isVariableDeclarationList(node.parent) && ts.isVariableStatement(node.parent.parent)) {
    state.registerDeclarationExport(
      node.parent.parent,
      ts.isIdentifier(node.name) ? node.name.text : undefined
    );
  }
  return true;
};

const visitPropertyDeclaration: NodeVisitor = (node, state) => {
  if (!ts.isPropertyDeclaration(node)) return false;
  const propertyName = getPropertyNameText(node.name);
  if (propertyName) state.variables.add(propertyName);
  return true;
};

const DECLARATION_VISITORS: NodeVisitor[] = [
  visitFunctionDeclaration,
  visitMethodLike,
  visitTypeDeclaration,
  visitVariableDeclaration,
  visitPropertyDeclaration,
];

/** Tries each declaration visitor on the node; true when one of them handled it. */
export const visitDeclarations: NodeVisitor = (node, state) =>
  DECLARATION_VISITORS.some((visit) => visit(node, state));
