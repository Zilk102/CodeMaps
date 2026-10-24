// Facts of a Kotlin file: package, imports with aliases, classes, objects and functions, and used
// names.

import type { Node } from 'web-tree-sitter';
import type { ImportRecord } from '../types';
import { namedOf } from './astUtils';
import {
  FactsAccumulator,
  importHandler,
  type NodeHandler,
  walkWithHandlers,
} from './factsAccumulator';
import type { LanguageFactsWithDeclarations } from './types';

const TYPE_DECLARATIONS = new Set(['class_declaration', 'object_declaration']);

interface KotlinState {
  acc: FactsAccumulator;
  packageName?: string;
}

const childOfType = (node: Node, type: string): Node | undefined =>
  namedOf(node).find((child) => child.type === type);

/** One import header. A `.*` import gets `*`, an `as` alias is kept; null without a path. */
const readImport = (header: Node): ImportRecord | null => {
  const path = childOfType(header, 'identifier')?.text;
  if (!path) return null;
  if (childOfType(header, 'wildcard_import')) return { path, importedEntities: ['*'] };
  const alias = childOfType(header, 'import_alias');
  const aliasName = alias ? childOfType(alias, 'type_identifier')?.text : undefined;
  return aliasName
    ? { path, importedEntities: [], alias: aliasName }
    : { path, importedEntities: [] };
};

const typeName = (node: Node): string | undefined => childOfType(node, 'type_identifier')?.text;

/** Name of the class or object a member belongs to; `local` for functions nested in functions. */
const memberOwner = (node: Node): { owner?: string; local: boolean } => {
  for (let current = node.parent; current; current = current.parent) {
    if (current.type === 'function_declaration') return { local: true };
    if (TYPE_DECLARATIONS.has(current.type)) return { owner: typeName(current), local: false };
  }
  return { local: false };
};

const functionName = (node: Node): Node | undefined => childOfType(node, 'simple_identifier');

const startsUppercase = (value: string) => /^[A-Z]/.test(value);

const declareType = (node: Node, acc: FactsAccumulator): boolean => {
  const name = childOfType(node, 'type_identifier');
  if (name) acc.entities.add('class', name.text, name);
  return true;
};

const HANDLERS: Record<string, NodeHandler<KotlinState>> = {
  package_header: (node, state) => {
    state.packageName = childOfType(node, 'identifier')?.text;
    return false;
  },
  import_header: importHandler(readImport),
  class_declaration: (node, { acc }) => declareType(node, acc),
  object_declaration: (node, { acc }) => declareType(node, acc),
  type_alias: (node, { acc }) => declareType(node, acc),
  function_declaration: (node, { acc }) => {
    const name = functionName(node);
    const { owner, local } = memberOwner(node);
    if (name && !local)
      acc.entities.add('function', owner ? `${owner}.${name.text}` : name.text, name);
    return true;
  },
  type_identifier: (node, { acc }) => {
    acc.noteIdentifier(node);
    return false;
  },
  simple_identifier: (node, { acc }) => {
    const isCallee =
      node.parent?.type === 'call_expression' && node.parent.firstNamedChild?.id === node.id;
    if (isCallee || startsUppercase(node.text)) acc.noteIdentifier(node);
    return false;
  },
};

/**
 * Facts of a Kotlin file. Member functions are named `Owner.fn`; functions nested inside other
 * functions are skipped. Used names are types, callees and capitalised identifiers.
 */
export const extractKotlinFacts = (root: Node): LanguageFactsWithDeclarations => {
  const state: KotlinState = { acc: new FactsAccumulator(true) };
  walkWithHandlers(root, state, HANDLERS);
  return state.acc.toFacts({ packageName: state.packageName });
};
