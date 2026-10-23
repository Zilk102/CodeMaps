import type { Node } from 'web-tree-sitter';
import type { ImportRecord } from '../types';
import { walkNamed, namedOf } from './astUtils';
import { FactsAccumulator, type NodeHandler } from './factsAccumulator';
import type { LanguageFactsWithDeclarations } from './types';

const ITEM_TYPES = new Set(['struct_item', 'enum_item', 'union_item', 'trait_item', 'type_item']);

/** Expands a `use` tree into one import per leaf: `a::{b, c::d}` -> a::b, a::c::d. */
const flattenUse = (node: Node, prefix: string, out: ImportRecord[]): void => {
  const join = (tail: string) => (prefix ? `${prefix}::${tail}` : tail);
  switch (node.type) {
    case 'scoped_use_list': {
      const path = node.childForFieldName('path')?.text;
      const list = node.childForFieldName('list');
      const base = path ? join(path) : prefix;
      if (list) namedOf(list).forEach((child) => flattenUse(child, base, out));
      return;
    }
    case 'use_list':
      namedOf(node).forEach((child) => flattenUse(child, prefix, out));
      return;
    case 'use_as_clause': {
      const path = node.childForFieldName('path')?.text;
      const alias = node.childForFieldName('alias')?.text;
      if (path) out.push({ path: join(path), importedEntities: [], alias });
      return;
    }
    case 'use_wildcard': {
      const path = namedOf(node)[0]?.text;
      out.push({ path: path ? join(path) : prefix, importedEntities: ['*'] });
      return;
    }
    case 'self':
      if (prefix) out.push({ path: prefix, importedEntities: [] });
      return;
    default:
      out.push({ path: join(node.text), importedEntities: [] });
  }
};

const implTypeName = (impl: Node): string | undefined => {
  const type = impl.childForFieldName('type');
  if (!type) return undefined;
  const inner = type.type === 'generic_type' ? type.childForFieldName('type') : type;
  return inner?.text;
};

interface RustState {
  acc: FactsAccumulator;
  moduleDeclarations: string[];
}

const registerImplMembers = (impl: Node, acc: FactsAccumulator): void => {
  const owner = implTypeName(impl);
  const body = impl.childForFieldName('body');
  for (const member of body ? namedOf(body) : []) {
    if (member.type !== 'function_item') continue;
    const name = member.childForFieldName('name');
    if (name) acc.entities.add('function', owner ? `${owner}::${name.text}` : name.text, name);
  }
};

const identifierHandler: NodeHandler<RustState> = (node, { acc }) => {
  acc.noteIdentifier(node);
  return false;
};

const HANDLERS: Record<string, NodeHandler<RustState>> = {
  use_declaration: (node, { acc }) => {
    const argument = node.childForFieldName('argument');
    if (argument) flattenUse(argument, '', acc.imports);
    return false;
  },
  mod_item: (node, state) => {
    const name = node.childForFieldName('name')?.text;
    if (name && !node.childForFieldName('body')) state.moduleDeclarations.push(name);
    return true;
  },
  impl_item: (node, { acc }) => {
    registerImplMembers(node, acc);
    return true;
  },
  function_item: (node, { acc }) => {
    const name = node.childForFieldName('name');
    // Impl members were registered with their type.
    if (name && node.parent?.parent?.type !== 'impl_item')
      acc.entities.add('function', name.text, name);
    return true;
  },
  scoped_identifier: (node, { acc }) => {
    const path = node.childForFieldName('path');
    const name = node.childForFieldName('name');
    if (path?.type === 'identifier' && name) acc.noteQualified('::', path.text, name.text);
    return true;
  },
  identifier: identifierHandler,
  type_identifier: identifierHandler,
};

const visitItem = (node: Node, { acc }: RustState): boolean => {
  if (ITEM_TYPES.has(node.type)) {
    const name = node.childForFieldName('name');
    if (name) acc.entities.add('class', name.text, name);
  }
  return true;
};

export const extractRustFacts = (root: Node): LanguageFactsWithDeclarations => {
  const state: RustState = { acc: new FactsAccumulator(), moduleDeclarations: [] };
  walkNamed(root, (node) => (HANDLERS[node.type] ?? visitItem)(node, state));
  return state.acc.toFacts({ moduleDeclarations: state.moduleDeclarations });
};
