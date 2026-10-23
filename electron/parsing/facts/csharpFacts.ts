import type { Node } from 'web-tree-sitter';
import type { ImportRecord } from '../types';
import { addOwnedFunction, allChildren, namedOf } from './astUtils';
import {
  FactsAccumulator,
  declareClassLike,
  importHandler,
  namespaceFacts,
  walkWithHandlers,
  type NamespaceState,
  type NodeHandler,
} from './factsAccumulator';
import type { LanguageFactsWithDeclarations } from './types';

const TYPE_DECLARATIONS = new Set([
  'class_declaration',
  'struct_declaration',
  'interface_declaration',
  'enum_declaration',
  'record_declaration',
  'record_struct_declaration',
  'delegate_declaration',
]);
const NAMESPACE_DECLARATIONS = new Set([
  'namespace_declaration',
  'file_scoped_namespace_declaration',
]);

type CSharpState = NamespaceState;

const stripGenerics = (value: string) => value.replace(/<.*>/s, '').replace(/^global::/, '');

/** `using X;` imports a namespace, `using static X;` a type's members, `using A = X;` an alias. */
const readUsing = (node: Node): ImportRecord | null => {
  const children = namedOf(node);
  const alias = children.find((child) => child.type === 'name_equals');
  const target = children.filter((child) => child.type !== 'name_equals').pop();
  if (!target) return null;
  const path = stripGenerics(target.text);
  if (alias) return { path, importedEntities: [], alias: namedOf(alias)[0]?.text };
  if (allChildren(node).some((child) => child.type === 'static')) {
    return { path, importedEntities: [], kind: 'static' };
  }
  return { path, importedEntities: ['*'], kind: 'namespace' };
};

/** Blocks nest (`namespace A { namespace B {} }`): the full name joins every enclosing one. */
const fullNamespace = (node: Node): string => {
  const parts: string[] = [];
  for (let current: Node | null = node; current; current = current.parent) {
    if (!NAMESPACE_DECLARATIONS.has(current.type)) continue;
    const name = current.childForFieldName('name')?.text;
    if (name) parts.unshift(name);
  }
  return parts.join('.');
};

const enclosingTypeName = (node: Node): string | undefined => {
  let owner: Node | null = node.parent;
  while (owner && !TYPE_DECLARATIONS.has(owner.type)) owner = owner.parent;
  return owner?.childForFieldName('name')?.text;
};

/** Parents whose `name` field declares something instead of referring to it. */
const DECLARING_PARENTS = new Set([
  ...TYPE_DECLARATIONS,
  'method_declaration',
  'constructor_declaration',
  'property_declaration',
  'parameter',
  'variable_declarator',
  'enum_member_declaration',
]);

const isDeclaredName = (node: Node): boolean =>
  !!node.parent &&
  DECLARING_PARENTS.has(node.parent.type) &&
  node.parent.childForFieldName('name')?.id === node.id;

const startsUppercase = (value: string) => /^[A-Z]/.test(value);

const declareTypes = declareClassLike(TYPE_DECLARATIONS);

const registerNamespace: NodeHandler<CSharpState> = (node, state) => {
  const name = fullNamespace(node);
  if (name && !state.namespaces.includes(name)) state.namespaces.push(name);
  return true;
};

const HANDLERS: Record<string, NodeHandler<CSharpState>> = {
  using_directive: importHandler(readUsing),
  namespace_declaration: registerNamespace,
  file_scoped_namespace_declaration: registerNamespace,
  method_declaration: (node, { acc }) => {
    addOwnedFunction(acc.entities, node, enclosingTypeName(node));
    return true;
  },
  qualified_name: (node, { acc }) => {
    if (node.parent && NAMESPACE_DECLARATIONS.has(node.parent.type)) return false;
    const parts = namedOf(node);
    const left = parts[0];
    const right = parts[parts.length - 1];
    if (parts.length >= 2) {
      acc.noteQualified('.', stripGenerics(left.text), right.text);
      acc.noteIdentifier(right);
    }
    return false;
  },
  identifier: (node, { acc }) => {
    if (startsUppercase(node.text) && !isDeclaredName(node)) acc.noteIdentifier(node);
    return false;
  },
  member_access_expression: (node, { acc }) => {
    const target = node.childForFieldName('expression');
    const member = node.childForFieldName('name');
    if (target?.type === 'identifier' && member) acc.noteQualified('.', target.text, member.text);
    return true;
  },
};

export const extractCSharpFacts = (root: Node): LanguageFactsWithDeclarations => {
  const state: NamespaceState = { acc: new FactsAccumulator(true), namespaces: [] };
  walkWithHandlers(root, state, HANDLERS, declareTypes);
  return namespaceFacts(state);
};
