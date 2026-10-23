import type { Node } from 'web-tree-sitter';
import type { ImportRecord } from '../types';
import { unquote, walkNamed, namedOf } from './astUtils';
import { FactsAccumulator, type NodeHandler } from './factsAccumulator';
import type { LanguageFactsWithDeclarations } from './types';

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
  import_spec: (node, { acc }) => {
    const record = readImport(node);
    if (record) acc.imports.push(record);
    return false;
  },
  type_spec: addNamed('class'),
  function_declaration: addNamed('function'),
  method_declaration: (node, { acc }) => {
    const name = node.childForFieldName('name');
    if (name) {
      const owner = receiverTypeName(node);
      acc.entities.add('function', owner ? `${owner}.${name.text}` : name.text, name);
    }
    return true;
  },
  selector_expression: (node, { acc }) => {
    const operand = node.childForFieldName('operand');
    const field = node.childForFieldName('field');
    if (operand?.type === 'identifier' && field) acc.noteQualified('.', operand.text, field.text);
    return true;
  },
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

export const extractGoFacts = (root: Node): LanguageFactsWithDeclarations => {
  const state: GoState = { acc: new FactsAccumulator() };
  walkNamed(root, (node) => HANDLERS[node.type]?.(node, state) ?? true);
  return state.acc.toFacts({ packageName: state.packageName });
};
