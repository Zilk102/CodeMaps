/**
 * Declaration rules of Go (comment above the declaration, capitalized names are exported),
 * Rust (`///` docs, `pub` items) and Zig (`///` docs, `pub` declarations).
 */
import type { Node } from 'web-tree-sitter';
import {
  callableKind,
  childOfType,
  fieldText,
  hasChildOfType,
  kindFromChild,
  type LanguageRules,
  type Scope,
} from './treeRules';
import type { SymbolKind } from './types';

// ---- Go ---------------------------------------------------------------------------------

const GO_TYPE_KINDS = new Map<string, SymbolKind>([
  ['struct_type', 'struct'],
  ['interface_type', 'interface'],
]);

const goKind = (node: Node): SymbolKind | null => {
  if (node.type === 'function_declaration') return 'function';
  if (node.type === 'method_declaration') return 'method';
  if (node.type === 'type_alias') return 'type';
  if (node.type !== 'type_spec') return null;
  return GO_TYPE_KINDS.get(node.childForFieldName('type')?.type ?? '') ?? 'type';
};

const isCapitalized = (name: string): boolean => /^\p{Lu}/u.test(name);

/** The type name a method is declared on: `Server` for `func (s *Server) Run()`. */
const receiverTypeName = (node: Node): string => {
  const parameter = node.childForFieldName('receiver')?.namedChild(0);
  const type = parameter?.childForFieldName('type')?.text ?? '';
  return type.replace(/[*\s]|\[.*$/g, '');
};

/** A single `type X ...` is documented above the `type` keyword, not above the spec. */
const goAnchor = (node: Node): Node => {
  const parent = node.parent;
  const single = parent?.type === 'type_declaration' && parent.namedChildCount === 1;
  return single ? parent : node;
};

export const goRules: LanguageRules = {
  descend: new Set(['source_file', 'type_declaration']),
  kindOf: goKind,
  nameOf: (node) => fieldText(node, 'name'),
  exported: (node) => {
    const name = fieldText(node, 'name') ?? '';
    const onExportedType =
      node.type !== 'method_declaration' || isCapitalized(receiverTypeName(node));
    return isCapitalized(name) && onExportedType;
  },
  anchorOf: goAnchor,
};

// ---- Rust -------------------------------------------------------------------------------

const RUST_KINDS = new Map<string, SymbolKind>([
  ['struct_item', 'struct'],
  ['union_item', 'struct'],
  ['enum_item', 'enum'],
  ['trait_item', 'trait'],
  ['type_item', 'type'],
  ['function_signature_item', 'method'],
]);

const isPublic = (node: Node): boolean => childOfType(node, 'visibility_modifier')?.text === 'pub';

/** Attributes (`#[derive(...)]`) sit between the doc comment and the item. */
const rustAnchor = (node: Node): Node => {
  let first = node;
  while (first.previousSibling?.type === 'attribute_item') first = first.previousSibling;
  return first;
};

const rustScope = (node: Node, scope: Scope): Scope | null => {
  if (node.type === 'impl_item') {
    // Trait implementations are documented on the trait.
    const exempt = scope.exempt || node.childForFieldName('trait') !== null;
    return { exported: true, implicitPublic: false, exempt, kind: 'class' };
  }
  if (node.type !== 'mod_item') return null;
  return { ...scope, exported: scope.exported && isPublic(node) };
};

export const rustRules: LanguageRules = {
  descend: new Set(['source_file', 'declaration_list', 'mod_item', 'impl_item']),
  kindOf: (node, scope) => {
    if (node.type === 'function_item') return callableKind(scope);
    return RUST_KINDS.get(node.type) ?? null;
  },
  nameOf: (node) => fieldText(node, 'name'),
  exported: (node, _kind, scope) => scope.exported && (scope.implicitPublic || isPublic(node)),
  anchorOf: rustAnchor,
  scopeOf: rustScope,
};

// ---- Zig --------------------------------------------------------------------------------

const ZIG_CONTAINERS = new Map<string, SymbolKind>([
  ['struct_declaration', 'struct'],
  ['union_declaration', 'struct'],
  ['opaque_declaration', 'struct'],
  ['enum_declaration', 'enum'],
]);

export const zigRules: LanguageRules = {
  descend: new Set(['source_file', ...ZIG_CONTAINERS.keys()]),
  kindOf: (node, scope) => {
    if (node.type === 'function_declaration') return callableKind(scope);
    // `const Name = struct { ... }` declares a type; any other `const` is a plain value.
    return node.type === 'variable_declaration' ? kindFromChild(node, ZIG_CONTAINERS) : null;
  },
  nameOf: (node) =>
    node.type === 'function_declaration'
      ? fieldText(node, 'name')
      : (childOfType(node, 'identifier')?.text ?? null),
  exported: (node, _kind, scope) => scope.exported && hasChildOfType(node, 'pub'),
};
