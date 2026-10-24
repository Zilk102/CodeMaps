/**
 * Collects the documentable declarations of a TypeScript, TSX or JavaScript file with the
 * TypeScript compiler API: functions, classes and their methods, interfaces, type aliases, enums
 * and arrow functions bound to a variable. This module only dispatches statements to the
 * handlers in the sibling declarationsTypeScript* modules.
 */
import ts from 'typescript';
import type { RawDeclaration } from './declarations';
import { addClass } from './declarationsTypeScriptClasses';
import { collectExportedNames } from './declarationsTypeScriptExports';
import type { Collector } from './declarationsTypeScriptShared';
import { addFunction, addNamed, addVariables } from './declarationsTypeScriptValues';

type Statement = ts.Statement;

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
