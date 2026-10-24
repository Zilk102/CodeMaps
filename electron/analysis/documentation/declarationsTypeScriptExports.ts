/**
 * Finds the names a TypeScript or JavaScript file exports without an `export` keyword on the
 * declaration, so the scanner can still mark those declarations as public API.
 */
import ts from 'typescript';

type Statement = ts.Statement;

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
export const collectExportedNames = (source: ts.SourceFile): Set<string> => {
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
