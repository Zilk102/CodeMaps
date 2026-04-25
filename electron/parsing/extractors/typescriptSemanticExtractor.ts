import ts from 'typescript';
import { LanguageDefinition, ParseResult } from '../types';
import { resolveTypeScriptModule } from '../semantic/typescriptProjectService';

const normalizePath = (value: string) => value.replace(/\\/g, '/');

const getScriptKind = (filePath: string) => {
  const normalized = filePath.toLowerCase();
  if (normalized.endsWith('.tsx')) return ts.ScriptKind.TSX;
  if (normalized.endsWith('.jsx')) return ts.ScriptKind.JSX;
  if (normalized.endsWith('.js') || normalized.endsWith('.mjs') || normalized.endsWith('.cjs'))
    return ts.ScriptKind.JS;
  return ts.ScriptKind.TS;
};

const getImportBindingName = (node: ts.ImportSpecifier) => {
  if (node.propertyName) {
    return node.propertyName.text;
  }

  return node.name.text;
};

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

const getCallName = (expression: ts.Expression): string | undefined => {
  if (ts.isIdentifier(expression)) {
    return expression.text;
  }

  if (ts.isPropertyAccessExpression(expression)) {
    return expression.name.text;
  }

  if (ts.isElementAccessExpression(expression)) {
    return expression.argumentExpression?.getText();
  }

  return undefined;
};

const maybeAddFunctionEntity = (
  entities: ParseResult['entities'],
  entityKeys: Set<string>,
  name?: string
) => {
  const normalized = name?.trim();
  if (!normalized) return;
  const key = `function:${normalized}`;
  if (entityKeys.has(key)) return;
  entityKeys.add(key);
  entities.push({ type: 'function', name: normalized });
};

const maybeAddClassEntity = (
  entities: ParseResult['entities'],
  entityKeys: Set<string>,
  name?: string
) => {
  const normalized = name?.trim();
  if (!normalized) return;
  const key = `class:${normalized}`;
  if (entityKeys.has(key)) return;
  entityKeys.add(key);
  entities.push({ type: 'class', name: normalized });
};

const maybeAddExport = (
  exports: ParseResult['exports'],
  exportKeys: Set<string>,
  exportedName?: string,
  localName?: string,
  isDefault: boolean = false
) => {
  const normalizedExportedName = exportedName?.trim();
  if (!normalizedExportedName) return;

  const normalizedLocalName = localName?.trim();
  const key = `${normalizedExportedName}:${normalizedLocalName || ''}:${isDefault ? 'default' : 'named'}`;
  if (exportKeys.has(key)) return;
  exportKeys.add(key);
  exports.push({
    exportedName: normalizedExportedName,
    localName: normalizedLocalName,
    isDefault,
  });
};

const isFunctionLikeInitializer = (initializer?: ts.Expression) =>
  !!initializer && (ts.isArrowFunction(initializer) || ts.isFunctionExpression(initializer));

const collectImportedEntities = (clause?: ts.ImportClause) => {
  const importedEntities = new Set<string>();

  if (!clause) return importedEntities;

  if (clause.name) {
    importedEntities.add('default');
  }

  if (clause.namedBindings) {
    if (ts.isNamespaceImport(clause.namedBindings)) {
      importedEntities.add('*');
    } else {
      clause.namedBindings.elements.forEach((element) => {
        importedEntities.add(getImportBindingName(element));
      });
    }
  }

  return importedEntities;
};

const createImportRecord = (
  sourceFilePath: string,
  moduleSpecifier: string,
  importedEntities: Set<string>,
  baseDir?: string
) => {
  const record = {
    path: moduleSpecifier,
    importedEntities: Array.from(importedEntities),
    resolvedPath: resolveTypeScriptModule(moduleSpecifier, sourceFilePath, baseDir),
  };

  return record;
};

export const extractWithTypeScriptSemantic = (
  filePath: string,
  text: string,
  definition: LanguageDefinition,
  adr?: string,
  baseDir?: string
): ParseResult => {
  const importsMap = new Map<string, { importedEntities: Set<string>; resolvedPath?: string }>();
  const entities: ParseResult['entities'] = [];
  const exports: ParseResult['exports'] = [];
  const variables = new Set<string>();
  const calls = new Set<string>();
  const comments = new Set<string>();
  const entityKeys = new Set<string>();
  const exportKeys = new Set<string>();

  const sourceFile = ts.createSourceFile(
    filePath,
    text,
    ts.ScriptTarget.Latest,
    true,
    getScriptKind(filePath)
  );

  const addImport = (moduleSpecifier: string, importedEntities: Set<string>) => {
    const normalizedSpecifier = moduleSpecifier.trim();
    if (!normalizedSpecifier) return;

    const current = importsMap.get(normalizedSpecifier) || {
      importedEntities: new Set<string>(),
      resolvedPath: resolveTypeScriptModule(normalizedSpecifier, filePath, baseDir),
    };

    importedEntities.forEach((entity) => current.importedEntities.add(entity));
    importsMap.set(normalizedSpecifier, current);
  };

  const getNodeModifiers = (node: ts.Node): readonly ts.Modifier[] => {
    const maybeWithModifiers = node as ts.Node & { modifiers?: ts.NodeArray<ts.Modifier> };
    return maybeWithModifiers.modifiers ?? [];
  };

  const hasExportModifier = (node: ts.Node) =>
    getNodeModifiers(node).some(
      (modifier: ts.Modifier) => modifier.kind === ts.SyntaxKind.ExportKeyword
    );

  const hasDefaultModifier = (node: ts.Node) =>
    getNodeModifiers(node).some(
      (modifier: ts.Modifier) => modifier.kind === ts.SyntaxKind.DefaultKeyword
    );

  const registerDeclarationExport = (node: ts.Node, localName?: string) => {
    if (!hasExportModifier(node) || !localName) return;
    maybeAddExport(exports, exportKeys, localName, localName, hasDefaultModifier(node));
    if (hasDefaultModifier(node)) {
      maybeAddExport(exports, exportKeys, 'default', localName, true);
    }
  };

  const walk = (node: ts.Node) => {
    if (ts.isImportDeclaration(node) && ts.isStringLiteral(node.moduleSpecifier)) {
      addImport(node.moduleSpecifier.text, collectImportedEntities(node.importClause));
      if (node.importClause?.name) {
        variables.add(node.importClause.name.text);
      }
    } else if (
      ts.isExportDeclaration(node) &&
      node.moduleSpecifier &&
      ts.isStringLiteral(node.moduleSpecifier)
    ) {
      const exportedEntities = new Set<string>();
      if (node.exportClause && ts.isNamedExports(node.exportClause)) {
        node.exportClause.elements.forEach((element) => {
          exportedEntities.add(element.propertyName?.text || element.name.text);
          maybeAddExport(
            exports,
            exportKeys,
            element.name.text,
            element.propertyName?.text || element.name.text
          );
        });
      } else {
        exportedEntities.add('*');
      }
      addImport(node.moduleSpecifier.text, exportedEntities);
    } else if (
      ts.isExportDeclaration(node) &&
      node.exportClause &&
      ts.isNamedExports(node.exportClause)
    ) {
      node.exportClause.elements.forEach((element) => {
        maybeAddExport(
          exports,
          exportKeys,
          element.name.text,
          element.propertyName?.text || element.name.text
        );
      });
    } else if (
      ts.isImportEqualsDeclaration(node) &&
      ts.isExternalModuleReference(node.moduleReference) &&
      ts.isStringLiteral(node.moduleReference.expression)
    ) {
      const importedEntities = new Set<string>([node.name.text]);
      addImport(node.moduleReference.expression.text, importedEntities);
    } else if (ts.isCallExpression(node)) {
      const callName = getCallName(node.expression);
      if (callName) calls.add(callName);

      if (
        node.expression.kind === ts.SyntaxKind.ImportKeyword &&
        node.arguments.length === 1 &&
        ts.isStringLiteral(node.arguments[0])
      ) {
        addImport(node.arguments[0].text, new Set(['*']));
      }

      if (
        ts.isIdentifier(node.expression) &&
        node.expression.text === 'require' &&
        node.arguments.length === 1 &&
        ts.isStringLiteral(node.arguments[0])
      ) {
        addImport(node.arguments[0].text, new Set());
      }
    } else if (
      ts.isImportTypeNode(node) &&
      ts.isLiteralTypeNode(node.argument) &&
      ts.isStringLiteral(node.argument.literal)
    ) {
      addImport(node.argument.literal.text, new Set(['type']));
    } else if (ts.isFunctionDeclaration(node)) {
      maybeAddFunctionEntity(entities, entityKeys, node.name?.text);
      registerDeclarationExport(node, node.name?.text);
    } else if (
      ts.isMethodDeclaration(node) ||
      ts.isMethodSignature(node) ||
      ts.isGetAccessorDeclaration(node) ||
      ts.isSetAccessorDeclaration(node)
    ) {
      maybeAddFunctionEntity(entities, entityKeys, getPropertyNameText(node.name));
    } else if (
      ts.isClassDeclaration(node) ||
      ts.isInterfaceDeclaration(node) ||
      ts.isEnumDeclaration(node) ||
      ts.isTypeAliasDeclaration(node)
    ) {
      maybeAddClassEntity(entities, entityKeys, node.name?.text);
      registerDeclarationExport(node, node.name?.text);
    } else if (ts.isVariableDeclaration(node)) {
      const variableName = node.name.getText(sourceFile).trim();
      if (variableName) variables.add(variableName);
      if (ts.isIdentifier(node.name) && isFunctionLikeInitializer(node.initializer)) {
        maybeAddFunctionEntity(entities, entityKeys, node.name.text);
      }
      if (ts.isVariableDeclarationList(node.parent) && ts.isVariableStatement(node.parent.parent)) {
        registerDeclarationExport(
          node.parent.parent,
          ts.isIdentifier(node.name) ? node.name.text : undefined
        );
      }
    } else if (ts.isPropertyDeclaration(node)) {
      const propertyName = getPropertyNameText(node.name);
      if (propertyName) variables.add(propertyName);
    } else if (ts.isExportAssignment(node)) {
      if (ts.isIdentifier(node.expression)) {
        maybeAddExport(exports, exportKeys, 'default', node.expression.text, true);
      } else {
        maybeAddExport(exports, exportKeys, 'default', undefined, true);
      }
    }

    ts.forEachChild(node, walk);
  };

  walk(sourceFile);

  const commentRegex = /\/\/.*|\/\*[\s\S]*?\*\//g;
  const commentMatches = text.match(commentRegex) || [];
  commentMatches.forEach((comment) => {
    const normalized = comment.trim();
    if (normalized) comments.add(normalized);
  });

  const imports = Array.from(importsMap.entries()).map(([moduleSpecifier, value]) => ({
    path: moduleSpecifier,
    importedEntities: Array.from(value.importedEntities),
    resolvedPath: value.resolvedPath ? normalizePath(value.resolvedPath) : undefined,
  }));

  return {
    sizeExceeded: false,
    imports,
    entities,
    exports,
    adr,
    variables: Array.from(variables),
    calls: Array.from(calls),
    comments: Array.from(comments),
    detectedLanguage: definition.id,
  };
};
