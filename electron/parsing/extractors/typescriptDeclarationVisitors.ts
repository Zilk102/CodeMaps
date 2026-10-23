import ts from 'typescript';
import type { NodeVisitor } from './typescriptImportExportVisitors';

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

export const visitDeclarations: NodeVisitor = (node, state) =>
  DECLARATION_VISITORS.some((visit) => visit(node, state));
