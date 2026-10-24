/**
 * Class declarations for the TypeScript scanner: the class itself plus the documentable methods
 * it exposes, with visibility derived from the class export and the member modifiers.
 */
import ts from 'typescript';
import {
  hasModifier,
  isExportedStatement,
  nameOf,
  record,
  type Collector,
} from './declarationsTypeScriptShared';

const isHiddenMember = (member: ts.ClassElement): boolean =>
  hasModifier(member, ts.SyntaxKind.PrivateKeyword) ||
  hasModifier(member, ts.SyntaxKind.ProtectedKeyword) ||
  (!!member.name && ts.isPrivateIdentifier(member.name));

/** A method with a body, or an abstract one; the bodiless rest are overload signatures. */
const isDocumentableMethod = (member: ts.ClassElement): member is ts.MethodDeclaration =>
  ts.isMethodDeclaration(member) &&
  (!!member.body || hasModifier(member, ts.SyntaxKind.AbstractKeyword));

/** Adds the methods of a class as declarations; a method is public when the class is exported and the method has no private or protected modifier. */
const addClassMembers = (
  collector: Collector,
  declaration: ts.ClassDeclaration,
  classExported: boolean
): void => {
  for (const member of declaration.members.filter(isDocumentableMethod)) {
    record(collector, {
      node: member,
      name: nameOf(member, collector.source),
      kind: 'method',
      exported: classExported && !isHiddenMember(member),
      exempt: hasModifier(member, ts.SyntaxKind.OverrideKeyword),
    });
  }
};

/** Records a class declaration and then its documentable methods. */
export const addClass = (collector: Collector, declaration: ts.ClassDeclaration): void => {
  const name = nameOf(declaration, collector.source);
  const exported = isExportedStatement(collector, declaration, name);
  record(collector, { node: declaration, name, kind: 'class', exported });
  addClassMembers(collector, declaration, exported);
};
