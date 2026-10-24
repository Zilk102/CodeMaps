// Facts of a Ruby file: `require` imports, classes, modules, constants built by `Struct.new` and
// friends, methods, and `A::B` uses.

import type { Node } from 'web-tree-sitter';
import { namedOf } from './astUtils';
import { FactsAccumulator, type NodeHandler, walkWithHandlers } from './factsAccumulator';
import type { LanguageFactsWithDeclarations } from './types';

const OWNERS = new Set(['class', 'module']);
const LOADERS: Record<string, string | undefined> = {
  require: undefined,
  require_relative: 'relative',
  load: 'load',
};
const CONSTANT_FACTORIES = /^(Struct|Class|Module|Data)\.(new|define)\b/;

/** `Acme::User` -> `User`: nested modules are labelled by their own constant. */
const constantName = (node: Node | null): string | undefined => {
  if (!node) return undefined;
  if (node.type === 'constant') return node.text;
  return node.type === 'scope_resolution' ? node.childForFieldName('name')?.text : undefined;
};

const stringArgument = (call: Node): string | null => {
  const argument = call.childForFieldName('arguments');
  const first = argument ? namedOf(argument)[0] : undefined;
  if (first?.type !== 'string') return null;
  const parts = namedOf(first);
  if (parts.some((part) => part.type !== 'string_content')) return null;
  return parts.map((part) => part.text).join('') || null;
};

const enclosingOwnerName = (node: Node): string | undefined => {
  for (let current = node.parent; current; current = current.parent) {
    if (OWNERS.has(current.type)) return constantName(current.childForFieldName('name'));
  }
  return undefined;
};

const defineMethod: NodeHandler<FactsAccumulator> = (node, acc) => {
  const name = node.childForFieldName('name');
  if (!name) return true;
  const owner = enclosingOwnerName(node);
  // `def self.find` and `def find` both end up as `User.find`.
  acc.entities.add('function', owner ? `${owner}.${name.text}` : name.text, name);
  return true;
};

const defineOwner: NodeHandler<FactsAccumulator> = (node, acc) => {
  const nameNode = node.childForFieldName('name');
  const name = constantName(nameNode);
  if (name && nameNode) acc.entities.add('class', name, nameNode);
  return true;
};

/**
 * Records a `require`, `require_relative` or `load` call that has no receiver and a literal string
 * argument as an import (kind `relative` or `load` for the latter two). Any other call is left to
 * the walk.
 */
const callHandler: NodeHandler<FactsAccumulator> = (node, acc) => {
  const method = node.childForFieldName('method')?.text ?? '';
  if (node.childForFieldName('receiver') || !Object.hasOwn(LOADERS, method)) return true;
  const path = stringArgument(node);
  if (path) {
    const kind = LOADERS[method];
    acc.imports.push(kind ? { path, importedEntities: [], kind } : { path, importedEntities: [] });
  }
  return false;
};

const assignmentHandler: NodeHandler<FactsAccumulator> = (node, acc) => {
  const left = node.childForFieldName('left');
  const right = node.childForFieldName('right')?.text ?? '';
  if (left?.type === 'constant' && CONSTANT_FACTORIES.test(right)) {
    acc.entities.add('class', left.text, left);
  }
  return true;
};

const HANDLERS: Record<string, NodeHandler<FactsAccumulator>> = {
  class: defineOwner,
  module: defineOwner,
  method: defineMethod,
  singleton_method: defineMethod,
  call: callHandler,
  assignment: assignmentHandler,
  scope_resolution: (node, acc) => {
    const qualifier = constantName(node.childForFieldName('scope'));
    const name = constantName(node);
    if (qualifier && name) acc.noteQualified('::', qualifier, name);
    return true;
  },
  constant: (node, acc) => {
    acc.noteIdentifier(node);
    return false;
  },
};

/**
 * Facts of a Ruby file. Methods are named `Owner.method` after the enclosing class or module; used
 * names are constants.
 */
export const extractRubyFacts = (root: Node): LanguageFactsWithDeclarations => {
  const acc = new FactsAccumulator(true);
  walkWithHandlers(root, acc, HANDLERS);
  return acc.toFacts({});
};
