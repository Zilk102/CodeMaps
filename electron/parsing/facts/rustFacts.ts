import type { Node } from 'web-tree-sitter';
import type { ImportRecord } from '../types';
import { addOwnedFunction, namedOf } from './astUtils';
import {
  FactsAccumulator,
  declareClassLike,
  qualifiedUseHandler,
  type NodeHandler,
  walkWithHandlers,
} from './factsAccumulator';
import type { LanguageFactsWithDeclarations } from './types';

const ITEM_TYPES = new Set(['struct_item', 'enum_item', 'union_item', 'trait_item', 'type_item']);

type UseFlattener = (node: Node, prefix: string, out: ImportRecord[]) => void;

const joinPath = (prefix: string, tail: string) => (prefix ? `${prefix}::${tail}` : tail);

const USE_FLATTENERS: Record<string, UseFlattener> = {
  scoped_use_list: (node, prefix, out) => {
    const path = node.childForFieldName('path')?.text;
    const list = node.childForFieldName('list');
    const base = path ? joinPath(prefix, path) : prefix;
    if (list) namedOf(list).forEach((child) => flattenUse(child, base, out));
  },
  use_list: (node, prefix, out) => {
    namedOf(node).forEach((child) => flattenUse(child, prefix, out));
  },
  use_as_clause: (node, prefix, out) => {
    const path = node.childForFieldName('path')?.text;
    const alias = node.childForFieldName('alias')?.text;
    if (path) out.push({ path: joinPath(prefix, path), importedEntities: [], alias });
  },
  use_wildcard: (node, prefix, out) => {
    const path = namedOf(node)[0]?.text;
    out.push({ path: path ? joinPath(prefix, path) : prefix, importedEntities: ['*'] });
  },
  self: (_node, prefix, out) => {
    if (prefix) out.push({ path: prefix, importedEntities: [] });
  },
};

/** Expands a `use` tree into one import per leaf: `a::{b, c::d}` -> a::b, a::c::d. */
const flattenUse: UseFlattener = (node, prefix, out) => {
  const flatten = USE_FLATTENERS[node.type];
  if (flatten) flatten(node, prefix, out);
  else out.push({ path: joinPath(prefix, node.text), importedEntities: [] });
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

const declareItems = declareClassLike(ITEM_TYPES);

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
    // Impl members were registered with their type.
    if (node.parent?.parent?.type !== 'impl_item') addOwnedFunction(acc.entities, node, undefined);
    return true;
  },
  scoped_identifier: qualifiedUseHandler('::', 'path', 'name'),
  identifier: identifierHandler,
  type_identifier: identifierHandler,
};

export const extractRustFacts = (root: Node): LanguageFactsWithDeclarations => {
  const state: RustState = { acc: new FactsAccumulator(), moduleDeclarations: [] };
  walkWithHandlers(root, state, HANDLERS, declareItems);
  return state.acc.toFacts({ moduleDeclarations: state.moduleDeclarations });
};
