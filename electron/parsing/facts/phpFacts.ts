import type { Node } from 'web-tree-sitter';
import type { ImportRecord } from '../types';
import { addOwnedFunction, allChildren, namedOf } from './astUtils';
import {
  FactsAccumulator,
  declareClassLike,
  importsHandler,
  namespaceFacts,
  walkWithHandlers,
  type NamespaceState,
  type NodeHandler,
} from './factsAccumulator';
import type { LanguageFactsWithDeclarations } from './types';

const CLASS_LIKE = new Set([
  'class_declaration',
  'interface_declaration',
  'trait_declaration',
  'enum_declaration',
]);
const INCLUDES = new Set([
  'include_expression',
  'include_once_expression',
  'require_expression',
  'require_once_expression',
]);

type PhpState = NamespaceState;

const trimSlashes = (value: string) => value.replace(/^\\+|\\+$/g, '');
const startsUppercase = (value: string) => /^[A-Z]/.test(value);
const childOfType = (node: Node, type: string): Node | undefined =>
  namedOf(node).find((child) => child.type === type);

/** One `use` clause: `A\B\C`, optionally `as D`. */
const readClause = (clause: Node, prefix: string, kind?: string): ImportRecord | null => {
  const target = namedOf(clause).find((child) => child.type !== 'namespace_aliasing_clause');
  if (!target) return null;
  const tail = trimSlashes(target.text);
  const aliasing = childOfType(clause, 'namespace_aliasing_clause');
  const alias = aliasing ? namedOf(aliasing)[0]?.text : undefined;
  const record: ImportRecord = {
    path: prefix ? `${prefix}\\${tail}` : tail,
    importedEntities: [],
  };
  if (alias) record.alias = alias;
  if (kind) record.kind = kind;
  return record;
};

/** `use A\B;`, `use A\{B, C as D};`, `use function A\f;` and `use const A\X;`. */
const readUse = (node: Node): ImportRecord[] => {
  const kind = allChildren(node).find(
    (child) => child.type === 'function' || child.type === 'const'
  )?.type;
  const group = childOfType(node, 'namespace_use_group');
  const prefix = group ? trimSlashes(childOfType(node, 'namespace_name')?.text ?? '') : '';
  const clauses = group
    ? namedOf(group).filter((child) => child.type === 'namespace_use_group_clause')
    : namedOf(node).filter((child) => child.type === 'namespace_use_clause');
  return clauses.flatMap((clause) => readClause(clause, prefix, kind) ?? []);
};

const stringLiteral = (node: Node | undefined): string | null => {
  if (!node || (node.type !== 'string' && node.type !== 'encapsed_string')) return null;
  const parts = namedOf(node);
  if (parts.some((part) => part.type !== 'string_content' && part.type !== 'string_value')) {
    return null;
  }
  return parts.map((part) => part.text).join('');
};

const isDirectoryExpression = (node: Node | undefined): boolean =>
  !!node &&
  (node.text === '__DIR__' ||
    (node.type === 'function_call_expression' && /^dirname\(\s*__FILE__\s*\)$/.test(node.text)));

/** The literal path of `require 'x.php'` or `require __DIR__ . '/x.php'`; anything dynamic is null. */
const includePath = (argument: Node | undefined): string | null => {
  let current = argument;
  while (current?.type === 'parenthesized_expression') current = namedOf(current)[0];
  const literal = stringLiteral(current);
  if (literal !== null) return literal;
  if (current?.type !== 'binary_expression') return null;
  const [left, right] = namedOf(current);
  const tail = stringLiteral(right);
  if (tail === null || !isDirectoryExpression(left)) return null;
  return tail.startsWith('/') ? `.${tail}` : `./${tail}`;
};

const enclosingClassName = (node: Node): string | undefined => {
  let owner: Node | null = node.parent;
  while (owner && !CLASS_LIKE.has(owner.type)) owner = owner.parent;
  return owner?.childForFieldName('name')?.text;
};

const HANDLERS: Record<string, NodeHandler<PhpState>> = {
  namespace_definition: (node, state) => {
    const name = node.childForFieldName('name');
    if (name) state.namespaces.push(trimSlashes(name.text));
    return true;
  },
  namespace_use_declaration: importsHandler(readUse),
  function_definition: (node, { acc }) => {
    addOwnedFunction(acc.entities, node, undefined);
    return true;
  },
  method_declaration: (node, { acc }) => {
    addOwnedFunction(acc.entities, node, enclosingClassName(node));
    return true;
  },
  namespace_name: () => false,
  qualified_name: (node, { acc }) => {
    const text = node.text;
    const cut = text.lastIndexOf('\\');
    if (cut > 0) acc.noteQualified('\\', text.slice(0, cut), text.slice(cut + 1));
    return false;
  },
  name: (node, { acc }) => {
    const call = node.parent;
    const isCallee =
      call?.type === 'function_call_expression' &&
      call.childForFieldName('function')?.id === node.id;
    if (isCallee || startsUppercase(node.text)) acc.noteIdentifier(node);
    return false;
  },
};

const declareClasses = declareClassLike(CLASS_LIKE);

const visitDeclaration: NodeHandler<PhpState> = (node, state) => {
  if (INCLUDES.has(node.type)) {
    const path = includePath(namedOf(node)[0]);
    if (path) state.acc.imports.push({ path, importedEntities: [], kind: 'file' });
    return false;
  }
  return declareClasses(node, state);
};

export const extractPhpFacts = (root: Node): LanguageFactsWithDeclarations => {
  const state: PhpState = { acc: new FactsAccumulator(true), namespaces: [] };
  walkWithHandlers(root, state, HANDLERS, visitDeclaration);
  return namespaceFacts(state);
};
