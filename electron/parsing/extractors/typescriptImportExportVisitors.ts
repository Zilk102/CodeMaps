import ts from 'typescript';
import type { TypeScriptSemanticState } from './typescriptSemanticState';

/** A visitor returns true when it recognized and handled the node. */
export type NodeVisitor = (node: ts.Node, state: TypeScriptSemanticState) => boolean;

const getImportBindingName = (node: ts.ImportSpecifier) =>
  node.propertyName ? node.propertyName.text : node.name.text;

const collectImportedEntities = (clause?: ts.ImportClause) => {
  const importedEntities = new Set<string>();
  if (!clause) return importedEntities;
  if (clause.name) importedEntities.add('default');
  const bindings = clause.namedBindings;
  if (bindings && ts.isNamespaceImport(bindings)) importedEntities.add('*');
  else bindings?.elements.forEach((element) => importedEntities.add(getImportBindingName(element)));
  return importedEntities;
};

const getCallName = (expression: ts.Expression): string | undefined => {
  if (ts.isIdentifier(expression)) return expression.text;
  if (ts.isPropertyAccessExpression(expression)) return expression.name.text;
  if (ts.isElementAccessExpression(expression)) return expression.argumentExpression?.getText();
  return undefined;
};

const addNamedExportElements = (
  state: TypeScriptSemanticState,
  elements: readonly ts.ExportSpecifier[]
) => {
  elements.forEach((element) => {
    state.addExport(element.name.text, element.propertyName?.text || element.name.text);
  });
};

const visitImportDeclaration: NodeVisitor = (node, state) => {
  if (!ts.isImportDeclaration(node) || !ts.isStringLiteral(node.moduleSpecifier)) return false;
  state.addImport(node.moduleSpecifier.text, collectImportedEntities(node.importClause));
  if (node.importClause?.name) state.variables.add(node.importClause.name.text);
  return true;
};

const visitReExportDeclaration: NodeVisitor = (node, state) => {
  if (
    !ts.isExportDeclaration(node) ||
    !node.moduleSpecifier ||
    !ts.isStringLiteral(node.moduleSpecifier)
  ) {
    return false;
  }
  const exportedEntities = new Set<string>();
  if (node.exportClause && ts.isNamedExports(node.exportClause)) {
    node.exportClause.elements.forEach((element) => {
      exportedEntities.add(element.propertyName?.text || element.name.text);
    });
    addNamedExportElements(state, node.exportClause.elements);
  } else {
    exportedEntities.add('*');
  }
  state.addImport(node.moduleSpecifier.text, exportedEntities);
  state.addReExport(node.moduleSpecifier.text, exportedEntities);
  return true;
};

const visitLocalExportDeclaration: NodeVisitor = (node, state) => {
  if (
    !ts.isExportDeclaration(node) ||
    !node.exportClause ||
    !ts.isNamedExports(node.exportClause)
  ) {
    return false;
  }
  addNamedExportElements(state, node.exportClause.elements);
  return true;
};

const visitDynamicImportForms: NodeVisitor = (node, state) => {
  if (
    ts.isImportEqualsDeclaration(node) &&
    ts.isExternalModuleReference(node.moduleReference) &&
    ts.isStringLiteral(node.moduleReference.expression)
  ) {
    state.addImport(node.moduleReference.expression.text, new Set([node.name.text]));
    return true;
  }
  if (
    ts.isImportTypeNode(node) &&
    ts.isLiteralTypeNode(node.argument) &&
    ts.isStringLiteral(node.argument.literal)
  ) {
    state.addImport(node.argument.literal.text, new Set(['type']));
    return true;
  }
  return false;
};

const visitExportAssignment: NodeVisitor = (node, state) => {
  if (!ts.isExportAssignment(node)) return false;
  const localName = ts.isIdentifier(node.expression) ? node.expression.text : undefined;
  state.addExport('default', localName, true);
  return true;
};

const IMPORT_EXPORT_VISITORS: NodeVisitor[] = [
  visitImportDeclaration,
  visitReExportDeclaration,
  visitLocalExportDeclaration,
  visitDynamicImportForms,
  visitExportAssignment,
];

export const visitImportsAndExports: NodeVisitor = (node, state) =>
  IMPORT_EXPORT_VISITORS.some((visit) => visit(node, state));

/** Registers `import('x')` and `require('x')` calls with a single string-literal argument. */
const registerRuntimeImport = (node: ts.CallExpression, state: TypeScriptSemanticState) => {
  if (node.arguments.length !== 1 || !ts.isStringLiteral(node.arguments[0])) return;
  const specifier = node.arguments[0].text;
  if (node.expression.kind === ts.SyntaxKind.ImportKeyword) {
    state.addImport(specifier, new Set(['*']));
  }
  if (ts.isIdentifier(node.expression) && node.expression.text === 'require') {
    state.addImport(specifier, new Set());
  }
};

export const visitCalls: NodeVisitor = (node, state) => {
  if (!ts.isCallExpression(node)) return false;
  const callName = getCallName(node.expression);
  if (callName) state.calls.add(callName);
  registerRuntimeImport(node, state);
  return true;
};
