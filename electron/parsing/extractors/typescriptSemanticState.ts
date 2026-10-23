import ts from 'typescript';
import { ParseResult, SourceLocation } from '../types';
import { resolveTypeScriptModule } from '../semantic/typescriptProjectService';

export const getSourceLocation = (sourceFile: ts.SourceFile, node: ts.Node): SourceLocation => {
  const start = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile));
  const end = sourceFile.getLineAndCharacterOfPosition(node.getEnd());
  return {
    startLine: start.line + 1,
    startColumn: start.character + 1,
    endLine: end.line + 1,
    endColumn: end.character + 1,
  };
};

const hasModifierKind = (node: ts.Node, kind: ts.SyntaxKind): boolean => {
  const maybeWithModifiers = node as ts.Node & { modifiers?: ts.NodeArray<ts.Modifier> };
  return (maybeWithModifiers.modifiers ?? []).some(
    (modifier: ts.Modifier) => modifier.kind === kind
  );
};

/** Everything the AST walk of one TypeScript/JavaScript file collects. */
export class TypeScriptSemanticState {
  readonly importsMap = new Map<string, { importedEntities: Set<string>; resolvedPath?: string }>();
  readonly reExportsMap = new Map<string, { entities: Set<string>; resolvedPath?: string }>();
  readonly entities: ParseResult['entities'] = [];
  readonly exports: ParseResult['exports'] = [];
  readonly variables = new Set<string>();
  readonly calls = new Set<string>();
  private readonly entityKeys = new Set<string>();
  private readonly exportKeys = new Set<string>();

  constructor(
    readonly sourceFile: ts.SourceFile,
    private readonly filePath: string,
    private readonly baseDir?: string
  ) {}

  addReExport(moduleSpecifier: string, entities: Set<string>) {
    const specifier = moduleSpecifier.trim();
    if (!specifier) return;
    const current = this.reExportsMap.get(specifier) || {
      entities: new Set<string>(),
      resolvedPath: resolveTypeScriptModule(specifier, this.filePath, this.baseDir),
    };
    entities.forEach((entity) => current.entities.add(entity));
    this.reExportsMap.set(specifier, current);
  }

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

  /** Adds a `function` or `class` entity once per name, located at `node`. */
  addEntity(type: 'function' | 'class', node: ts.Node, name?: string) {
    const normalized = name?.trim();
    if (!normalized) return;
    const key = `${type}:${normalized}`;
    if (this.entityKeys.has(key)) return;
    this.entityKeys.add(key);
    this.entities.push({
      type,
      name: normalized,
      location: getSourceLocation(this.sourceFile, node),
    });
  }

  addExport(exportedName?: string, localName?: string, isDefault: boolean = false) {
    const normalizedExportedName = exportedName?.trim();
    if (!normalizedExportedName) return;

    const normalizedLocalName = localName?.trim();
    const key = `${normalizedExportedName}:${normalizedLocalName || ''}:${isDefault ? 'default' : 'named'}`;
    if (this.exportKeys.has(key)) return;
    this.exportKeys.add(key);
    this.exports.push({
      exportedName: normalizedExportedName,
      localName: normalizedLocalName,
      isDefault,
    });
  }

  registerDeclarationExport(node: ts.Node, localName?: string) {
    if (!hasModifierKind(node, ts.SyntaxKind.ExportKeyword) || !localName) return;
    const isDefault = hasModifierKind(node, ts.SyntaxKind.DefaultKeyword);
    this.addExport(localName, localName, isDefault);
    if (isDefault) this.addExport('default', localName, true);
  }
}
