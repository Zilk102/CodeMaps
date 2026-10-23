import ts from 'typescript';
import { LanguageDefinition, ParseResult } from '../types';
import { visitDeclarations } from './typescriptDeclarationVisitors';
import { visitCalls, visitImportsAndExports } from './typescriptImportExportVisitors';
import { TypeScriptSemanticState } from './typescriptSemanticState';

const normalizePath = (value: string) => value.replace(/\\/g, '/');

const getScriptKind = (filePath: string) => {
  const normalized = filePath.toLowerCase();
  if (normalized.endsWith('.tsx')) return ts.ScriptKind.TSX;
  if (normalized.endsWith('.jsx')) return ts.ScriptKind.JSX;
  if (normalized.endsWith('.js') || normalized.endsWith('.mjs') || normalized.endsWith('.cjs'))
    return ts.ScriptKind.JS;
  return ts.ScriptKind.TS;
};

const walk = (node: ts.Node, state: TypeScriptSemanticState): void => {
  if (!visitImportsAndExports(node, state) && !visitCalls(node, state)) {
    visitDeclarations(node, state);
  }
  ts.forEachChild(node, (child) => walk(child, state));
};

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

  const visitor = new TypeScriptSemanticState(sourceFile, filePath, baseDir);
  walk(sourceFile, visitor);

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

  const reExports = Array.from(visitor.reExportsMap.entries()).map(([specifier, value]) => ({
    path: specifier,
    entities: Array.from(value.entities),
    resolvedPath: value.resolvedPath ? normalizePath(value.resolvedPath) : undefined,
  }));

  return {
    sizeExceeded: false,
    imports,
    entities: visitor.entities,
    exports: visitor.exports,
    reExports,
    adr,
    variables: Array.from(visitor.variables),
    calls: Array.from(visitor.calls),
    comments: Array.from(comments),
    detectedLanguage: definition.id,
  };
};
