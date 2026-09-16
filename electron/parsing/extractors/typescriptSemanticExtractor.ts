import ts from 'typescript';
import { LanguageDefinition, ParseResult, SourceLocation } from '../types';
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

const getSourceLocation = (sourceFile: ts.SourceFile, node: ts.Node): SourceLocation => {
  const start = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile));
  const end = sourceFile.getLineAndCharacterOfPosition(node.getEnd());
  return {
    startLine: start.line + 1,
    startColumn: start.character + 1,
    endLine: end.line + 1,
    endColumn: end.character + 1,
  };
};

const maybeAddFunctionEntity = (
  entities: ParseResult['entities'],
  entityKeys: Set<string>,
  name?: string,
  location?: SourceLocation
) => {
  const normalized = name?.trim();
  if (!normalized) return;
  const key = `function:${normalized}`;
  if (entityKeys.has(key)) return;
  entityKeys.add(key);
  entities.push({ type: 'function', name: normalized, location });
};

const maybeAddClassEntity = (
  entities: ParseResult['entities'],
  entityKeys: Set<string>,
  name?: string,
  location?: SourceLocation
) => {
  const normalized = name?.trim();
  if (!normalized) return;
  const key = `class:${normalized}`;
  if (entityKeys.has(key)) return;
  entityKeys.add(key);
  entities.push({ type: 'class', name: normalized, location });
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

class TypeScriptASTVisitor {
  importsMap = new Map<string, { importedEntities: Set<string>; resolvedPath?: string }>();
  entities: ParseResult['entities'] = [];
  exports: ParseResult['exports'] = [];
  variables = new Set<string>();
  calls = new Set<string>();
  entityKeys = new Set<string>();
  exportKeys = new Set<string>();

  constructor(
    private sourceFile: ts.SourceFile,
    private filePath: string,
    private baseDir?: string
  ) {}

  addImport(moduleSpecifier: string, importedEntities: Set<string>) {
    const normalizedSpecifier = moduleSpecifier.trim();
    if (!normalizedSpecifier) return;
    const current = this.importsMap.get(normalizedSpecifier) || {
      importedEntities: new Set<string>(),
      resolvedPath: resolveTypeScriptModule(normalizedSpecifier, this.filePath, this.baseDir),
    };
    importedEntities.forEach((entity) => current.importedEntities.add(entity));
    this.importsMap.set(normalizedSpecifier, current);
  }

  getNodeModifiers(node: ts.Node): readonly ts.Modifier[] {
    const maybeWithModifiers = node as ts.Node & { modifiers?: ts.NodeArray<ts.Modifier> };
    return maybeWithModifiers.modifiers ?? [];
  }

  hasExportModifier(node: ts.Node) {
    return this.getNodeModifiers(node).some(
      (modifier: ts.Modifier) => modifier.kind === ts.SyntaxKind.ExportKeyword
    );
  }

  hasDefaultModifier(node: ts.Node) {
    return this.getNodeModifiers(node).some(
      (modifier: ts.Modifier) => modifier.kind === ts.SyntaxKind.DefaultKeyword
    );
  }

  registerDeclarationExport(node: ts.Node, localName?: string) {
    if (!this.hasExportModifier(node) || !localName) return;
    maybeAddExport(
      this.exports,
      this.exportKeys,
      localName,
      localName,
      this.hasDefaultModifier(node)
    );
    if (this.hasDefaultModifier(node)) {
      maybeAddExport(this.exports, this.exportKeys, 'default', localName, true);
    }
  }

  visitImportsAndExports(node: ts.Node) {
    if (ts.isImportDeclaration(node) && ts.isStringLiteral(node.moduleSpecifier)) {
      this.addImport(node.moduleSpecifier.text, collectImportedEntities(node.importClause));
      if (node.importClause?.name) {
        this.variables.add(node.importClause.name.text);
      }
      return true;
    }
    if (
      ts.isExportDeclaration(node) &&
      node.moduleSpecifier &&
      ts.isStringLiteral(node.moduleSpecifier)
    ) {
      const exportedEntities = new Set<string>();
      if (node.exportClause && ts.isNamedExports(node.exportClause)) {
        node.exportClause.elements.forEach((element) => {
          exportedEntities.add(element.propertyName?.text || element.name.text);
          maybeAddExport(
            this.exports,
            this.exportKeys,
            element.name.text,
            element.propertyName?.text || element.name.text
          );
        });
      } else {
        exportedEntities.add('*');
      }
      this.addImport(node.moduleSpecifier.text, exportedEntities);
      return true;
    }
    if (ts.isExportDeclaration(node) && node.exportClause && ts.isNamedExports(node.exportClause)) {
      node.exportClause.elements.forEach((element) => {
        maybeAddExport(
          this.exports,
          this.exportKeys,
          element.name.text,
          element.propertyName?.text || element.name.text
        );
      });
      return true;
    }
    if (
      ts.isImportEqualsDeclaration(node) &&
      ts.isExternalModuleReference(node.moduleReference) &&
      ts.isStringLiteral(node.moduleReference.expression)
    ) {
      this.addImport(node.moduleReference.expression.text, new Set([node.name.text]));
      return true;
    }
    if (
      ts.isImportTypeNode(node) &&
      ts.isLiteralTypeNode(node.argument) &&
      ts.isStringLiteral(node.argument.literal)
    ) {
      this.addImport(node.argument.literal.text, new Set(['type']));
      return true;
    }
    if (ts.isExportAssignment(node)) {
      if (ts.isIdentifier(node.expression)) {
        maybeAddExport(this.exports, this.exportKeys, 'default', node.expression.text, true);
      } else {
        maybeAddExport(this.exports, this.exportKeys, 'default', undefined, true);
      }
      return true;
    }
    return false;
  }

  visitCalls(node: ts.Node) {
    if (ts.isCallExpression(node)) {
      const callName = getCallName(node.expression);
      if (callName) this.calls.add(callName);

      if (
        node.expression.kind === ts.SyntaxKind.ImportKeyword &&
        node.arguments.length === 1 &&
        ts.isStringLiteral(node.arguments[0])
      ) {
        this.addImport(node.arguments[0].text, new Set(['*']));
      }

      if (
        ts.isIdentifier(node.expression) &&
        node.expression.text === 'require' &&
        node.arguments.length === 1 &&
        ts.isStringLiteral(node.arguments[0])
      ) {
        this.addImport(node.arguments[0].text, new Set());
      }
      return true;
    }
    return false;
  }

  visitDeclarations(node: ts.Node) {
    if (ts.isFunctionDeclaration(node)) {
      maybeAddFunctionEntity(
        this.entities,
        this.entityKeys,
        node.name?.text,
        getSourceLocation(this.sourceFile, node)
      );
      this.registerDeclarationExport(node, node.name?.text);
      return true;
    }
    if (
      ts.isMethodDeclaration(node) ||
      ts.isMethodSignature(node) ||
      ts.isGetAccessorDeclaration(node) ||
      ts.isSetAccessorDeclaration(node)
    ) {
      maybeAddFunctionEntity(
        this.entities,
        this.entityKeys,
        getPropertyNameText(node.name),
        getSourceLocation(this.sourceFile, node)
      );
      return true;
    }
    if (
      ts.isClassDeclaration(node) ||
      ts.isInterfaceDeclaration(node) ||
      ts.isEnumDeclaration(node) ||
      ts.isTypeAliasDeclaration(node)
    ) {
      maybeAddClassEntity(
        this.entities,
        this.entityKeys,
        node.name?.text,
        getSourceLocation(this.sourceFile, node)
      );
      this.registerDeclarationExport(node, node.name?.text);
      return true;
    }
    if (ts.isVariableDeclaration(node)) {
      const variableName = node.name.getText(this.sourceFile).trim();
      if (variableName) this.variables.add(variableName);
      if (ts.isIdentifier(node.name) && isFunctionLikeInitializer(node.initializer)) {
        maybeAddFunctionEntity(
          this.entities,
          this.entityKeys,
          node.name.text,
          getSourceLocation(this.sourceFile, node)
        );
      }
      if (ts.isVariableDeclarationList(node.parent) && ts.isVariableStatement(node.parent.parent)) {
        this.registerDeclarationExport(
          node.parent.parent,
          ts.isIdentifier(node.name) ? node.name.text : undefined
        );
      }
      return true;
    }
    if (ts.isPropertyDeclaration(node)) {
      const propertyName = getPropertyNameText(node.name);
      if (propertyName) this.variables.add(propertyName);
      return true;
    }
    return false;
  }

  walk = (node: ts.Node) => {
    if (!this.visitImportsAndExports(node)) {
      if (!this.visitCalls(node)) {
        this.visitDeclarations(node);
      }
    }
    ts.forEachChild(node, this.walk);
  };
}

export const extractWithTypeScriptSemantic = (
  filePath: string,
  text: string,
  definition: LanguageDefinition,
  adr?: string,
  baseDir?: string
): ParseResult => {
  const sourceFile = ts.createSourceFile(
    filePath,
    text,
    ts.ScriptTarget.Latest,
    true,
    getScriptKind(filePath)
  );

  const visitor = new TypeScriptASTVisitor(sourceFile, filePath, baseDir);
  visitor.walk(sourceFile);

  const comments = new Set<string>();
  const commentRegex = /\/\/.*|\/\*[\s\S]*?\*\//g;
  const commentMatches = text.match(commentRegex) || [];
  commentMatches.forEach((comment) => {
    const normalized = comment.trim();
    if (normalized) comments.add(normalized);
  });

  const imports = Array.from(visitor.importsMap.entries()).map(([moduleSpecifier, value]) => ({
    path: moduleSpecifier,
    importedEntities: Array.from(value.importedEntities),
    resolvedPath: value.resolvedPath ? normalizePath(value.resolvedPath) : undefined,
  }));

  return {
    sizeExceeded: false,
    imports,
    entities: visitor.entities,
    exports: visitor.exports,
    adr,
    variables: Array.from(visitor.variables),
    calls: Array.from(visitor.calls),
    comments: Array.from(comments),
    detectedLanguage: definition.id,
  };
};
