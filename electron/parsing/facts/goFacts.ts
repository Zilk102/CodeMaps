// Facts of a Go file: package name, imports with aliases, types, functions and methods, and
// `pkg.Name` uses.

import type { Node } from 'web-tree-sitter';
import type { ImportRecord } from '../types';
import { addOwnedFunction, unquote, namedOf } from './astUtils';
import {
  FactsAccumulator,
  importHandler,
  qualifiedUseHandler,
  type NodeHandler,
  walkWithHandlers,
} from './factsAccumulator';
import type { LanguageFactsWithDeclarations } from './types';

/**
 * Name of the type a method is declared on, looking through `*T` and generic `T[P]`; undefined when
 * it cannot be determined.
 */
const receiverTypeName = (method: Node): string | undefined => {
  const receiver = method.childForFieldName('receiver');
  let type = receiver?.namedChildren[0]?.childForFieldName('type') ?? null;
  // `*Handler` and `Repo[T]` both name the receiver type Handler / Repo.
  while (type && (type.type === 'pointer_type' || type.type === 'generic_type')) {
    type =
      type.type === 'generic_type' ? type.childForFieldName('type') : (namedOf(type)[0] ?? null);
  }
  return type?.type === 'type_identifier' ? type.text : undefined;
};

/** One import spec; keeps the alias (including `.` and `_`) verbatim. Null without a path. */
const readImport = (spec: Node): ImportRecord | null => {
  const pathNode = spec.childForFieldName('path');
  if (!pathNode) return null;
  const alias = spec.childForFieldName('name')?.text;
  return {
    path: unquote(pathNode.text),
    importedEntities: [],
    ...(alias ? { alias } : {}),
  };
};

interface GoState {
  acc: FactsAccumulator;
  packageName?: string;
}

const addNamed =
  (type: 'class' | 'function'): NodeHandler<GoState> =>
  (node, { acc }) => {
    const name = node.childForFieldName('name');
    if (name) acc.entities.add(type, name.text, name);
    return true;
  };

const HANDLERS: Record<string, NodeHandler<GoState>> = {
  package_clause: (node, state) => {
    state.packageName = namedOf(node)[0]?.text;
    return false;
  },
  import_spec: importHandler(readImport),
  type_spec: addNamed('class'),
  function_declaration: addNamed('function'),
  method_declaration: (node, { acc }) => {
    addOwnedFunction(acc.entities, node, receiverTypeName(node));
    return true;
  },
  selector_expression: qualifiedUseHandler('.', 'operand', 'field'),
  qualified_type: (node, { acc }) => {
    const pkg = node.childForFieldName('package');
    const name = node.childForFieldName('name');
    if (pkg && name) acc.noteQualified('.', pkg.text, name.text);
    return false;
  },
  identifier: (node, { acc }) => {
    acc.noteIdentifier(node);
    return false;
  },
  type_identifier: (node, { acc }) => {
    acc.noteIdentifier(node);
    return false;
  },
};

/**
 * Facts of a Go file. Methods are named `Type.method`, and the package clause gives `packageName`.
 */
export const extractGoFacts = (root: Node): LanguageFactsWithDeclarations => {
  const state: GoState = { acc: new FactsAccumulator() };
  walkWithHandlers(root, state, HANDLERS);
  return state.acc.toFacts({ packageName: state.packageName });
};
