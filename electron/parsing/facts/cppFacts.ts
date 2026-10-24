import type { Node } from 'web-tree-sitter';
import type { ImportRecord } from '../types';
import { fieldChildren } from './astUtils';
import { FactsAccumulator, type NodeHandler, walkWithHandlers } from './factsAccumulator';
import type { LanguageFactsWithDeclarations } from './types';

const TYPE_SPECIFIERS = new Set([
  'class_specifier',
  'struct_specifier',
  'union_specifier',
  'enum_specifier',
]);
/** Parents under which a declaration is a file, namespace or class member, not a local. */
const DECLARATION_SCOPES = new Set([
  'translation_unit',
  'declaration_list',
  'field_declaration_list',
  'linkage_specification',
]);
const NAME_NODES = new Set([
  'identifier',
  'field_identifier',
  'destructor_name',
  'operator_name',
  'type_identifier',
]);

const readInclude = (node: Node): ImportRecord | null => {
  const path = node.childForFieldName('path');
  if (!path) return null;
  if (path.type === 'system_lib_string') {
    return { path: path.text.replace(/^<|>$/g, ''), importedEntities: [], kind: 'system' };
  }
  const value = path.text.replace(/^"|"$/g, '');
  return value ? { path: value, importedEntities: [] } : null;
};

/** The scope a declaration sits in, looking through `template <...>`. */
const scopeOf = (node: Node): Node | null => {
  let parent = node.parent;
  while (parent && parent.type === 'template_declaration') parent = parent.parent;
  return parent;
};

/** `app::Foo::bar<T>` -> `Foo::bar`: the class qualifier is what names a member. */
const qualifiedName = (text: string): string => {
  const segments = text
    .replace(/<[^<>]*>/g, '')
    .split('::')
    .filter(Boolean);
  return segments.slice(-2).join('::');
};

const declaredName = (target: Node | null): string | undefined => {
  if (!target) return undefined;
  if (NAME_NODES.has(target.type)) return target.text;
  return target.type === 'qualified_identifier' ? qualifiedName(target.text) : undefined;
};

/** Looks through `*` and `&` declarators to the function declarator, if there is one. */
const functionDeclarator = (declarator: Node | null): Node | null => {
  let current = declarator;
  while (current && current.type !== 'function_declarator') {
    current = current.childForFieldName('declarator');
  }
  return current;
};

const ownerClassName = (node: Node): string | undefined => {
  const scope = scopeOf(node);
  if (scope?.type !== 'field_declaration_list') return undefined;
  const owner = scope.parent;
  return owner && TYPE_SPECIFIERS.has(owner.type)
    ? owner.childForFieldName('name')?.text
    : undefined;
};

const addFunction = (acc: FactsAccumulator, declarator: Node, owner: string | undefined): void => {
  const name = declaredName(
    functionDeclarator(declarator)?.childForFieldName('declarator') ?? null
  );
  if (!name) return;
  const full = owner && !name.includes('::') ? `${owner}::${name}` : name;
  acc.entities.add('function', full, declarator);
};

const functionHandler: NodeHandler<FactsAccumulator> = (node, acc) => {
  if (!DECLARATION_SCOPES.has(scopeOf(node)?.type ?? '')) return true;
  const owner = ownerClassName(node);
  for (const declarator of fieldChildren(node, 'declarator')) addFunction(acc, declarator, owner);
  return true;
};

const typeHandler: NodeHandler<FactsAccumulator> = (node, acc) => {
  const name = node.childForFieldName('name');
  if (name?.type === 'type_identifier' && node.childForFieldName('body')) {
    acc.entities.add('class', name.text, name);
  }
  return true;
};

/**
 * Declares the names a typedef, `using X = ...` or `typedef struct {...} X;` introduces as class
 * entities.
 */
const aliasHandler: NodeHandler<FactsAccumulator> = (node, acc) => {
  const names =
    node.type === 'alias_declaration'
      ? [node.childForFieldName('name')]
      : fieldChildren(node, 'declarator');
  for (const name of names) {
    if (name?.type === 'type_identifier') acc.entities.add('class', name.text, name);
  }
  return true;
};

const noteQualifiedIdentifier: NodeHandler<FactsAccumulator> = (node, acc) => {
  const scope = node.childForFieldName('scope')?.text.replace(/<[^<>]*>/g, '');
  const name = node.childForFieldName('name')?.text.replace(/<.*$/s, '');
  const qualifier = scope?.split('::').filter(Boolean).pop();
  if (qualifier && name) acc.noteQualified('::', qualifier, name);
  return true;
};

const identifierHandler: NodeHandler<FactsAccumulator> = (node, acc) => {
  const call = node.parent;
  const callee = call?.type === 'call_expression' ? call.childForFieldName('function') : null;
  // Calls and macro-style constants; every local variable would drown the bounded name list.
  if (callee?.id === node.id || /^[A-Z]/.test(node.text)) acc.noteIdentifier(node);
  return false;
};

const noteHandler: NodeHandler<FactsAccumulator> = (node, acc) => {
  acc.noteIdentifier(node);
  return false;
};

const HANDLERS: Record<string, NodeHandler<FactsAccumulator>> = {
  preproc_include: (node, acc) => {
    const record = readInclude(node);
    if (record) acc.imports.push(record);
    return false;
  },
  function_definition: functionHandler,
  declaration: functionHandler,
  field_declaration: functionHandler,
  class_specifier: typeHandler,
  struct_specifier: typeHandler,
  union_specifier: typeHandler,
  enum_specifier: typeHandler,
  type_definition: aliasHandler,
  alias_declaration: aliasHandler,
  qualified_identifier: noteQualifiedIdentifier,
  identifier: identifierHandler,
  type_identifier: noteHandler,
  namespace_identifier: noteHandler,
};

/**
 * Facts of a C or C++ file: `#include` imports (`<...>` ones are marked `system`), types with a
 * body, functions (class members as `Class::method`), and used names and `A::b` qualifiers. Class
 * and function names share one namespace, because graph node ids are `file#name`.
 */
export const extractCppFacts = (root: Node): LanguageFactsWithDeclarations => {
  const acc = new FactsAccumulator(true);
  walkWithHandlers(root, acc, HANDLERS);
  return acc.toFacts({});
};
