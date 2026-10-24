/**
 * Declaration rules of the languages with explicit access modifiers on managed runtimes:
 * Java and Kotlin (Javadoc/KDoc), C# (XML doc comments) and Swift (`///` and double-star block comments).
 */
import type { Node } from 'web-tree-sitter';
import {
  callableKind,
  childOfType,
  kindFromChild,
  fieldText,
  hasChildOfType,
  hasModifierWord,
  type LanguageRules,
  type Scope,
} from './treeRules';
import type { SymbolKind } from './types';

/** The declared kind of a type or method node, from a table of node types. */
const tableKind = (table: Map<string, SymbolKind>, node: Node): SymbolKind | null =>
  table.get(node.type) ?? null;

// ---- Java -------------------------------------------------------------------------------

const JAVA_KINDS = new Map<string, SymbolKind>([
  ['class_declaration', 'class'],
  ['record_declaration', 'class'],
  ['interface_declaration', 'interface'],
  ['annotation_type_declaration', 'interface'],
  ['enum_declaration', 'enum'],
  ['method_declaration', 'method'],
]);

export const javaRules: LanguageRules = {
  descend: new Set([
    'program',
    'class_body',
    'interface_body',
    'enum_body',
    'enum_body_declarations',
    'annotation_type_body',
  ]),
  kindOf: (node) => tableKind(JAVA_KINDS, node),
  nameOf: (node) => fieldText(node, 'name'),
  exported: (node, _kind, scope) =>
    scope.exported && (scope.implicitPublic || hasModifierWord(node, 'public')),
  exempt: (node) => hasModifierWord(node, 'Override'),
};

// ---- C# ---------------------------------------------------------------------------------

const CSHARP_KINDS = new Map<string, SymbolKind>([
  ['class_declaration', 'class'],
  ['record_declaration', 'class'],
  ['struct_declaration', 'struct'],
  ['record_struct_declaration', 'struct'],
  ['interface_declaration', 'interface'],
  ['enum_declaration', 'enum'],
  ['delegate_declaration', 'type'],
  ['method_declaration', 'method'],
]);

export const csharpRules: LanguageRules = {
  descend: new Set([
    'compilation_unit',
    'namespace_declaration',
    'file_scoped_namespace_declaration',
    'declaration_list',
  ]),
  kindOf: (node) => tableKind(CSHARP_KINDS, node),
  nameOf: (node) => fieldText(node, 'name'),
  exported: (node, _kind, scope) =>
    scope.exported && (scope.implicitPublic || hasModifierWord(node, 'public')),
  exempt: (node) => hasModifierWord(node, 'override'),
};

// ---- Kotlin -----------------------------------------------------------------------------

const kotlinKind = (node: Node, scope: Scope): SymbolKind | null => {
  if (node.type === 'object_declaration') return 'class';
  if (node.type === 'type_alias') return 'type';
  if (node.type === 'function_declaration') return callableKind(scope);
  if (node.type !== 'class_declaration') return null;
  if (hasChildOfType(node, 'interface')) return 'interface';
  return hasModifierWord(node, 'enum') || hasChildOfType(node, 'enum') ? 'enum' : 'class';
};

const KOTLIN_HIDDEN = ['private', 'protected', 'internal'];

export const kotlinRules: LanguageRules = {
  descend: new Set(['source_file', 'class_body', 'enum_class_body', 'companion_object']),
  kindOf: kotlinKind,
  nameOf: (node) => childOfType(node, 'type_identifier', 'simple_identifier')?.text ?? null,
  exported: (node, _kind, scope) =>
    scope.exported && !KOTLIN_HIDDEN.some((word) => hasModifierWord(node, word)),
  exempt: (node) => hasModifierWord(node, 'override'),
};

// ---- Swift ------------------------------------------------------------------------------

const SWIFT_TYPE_KEYWORDS = new Map<string, SymbolKind | null>([
  ['class', 'class'],
  ['actor', 'class'],
  ['struct', 'struct'],
  ['enum', 'enum'],
  ['extension', null],
]);

const swiftKind = (node: Node, scope: Scope): SymbolKind | null => {
  // A `class_declaration` is a class, struct, enum, actor or extension, told by its keyword.
  if (node.type === 'class_declaration') return kindFromChild(node, SWIFT_TYPE_KEYWORDS);
  if (node.type === 'protocol_declaration') return 'interface';
  if (node.type === 'typealias_declaration') return 'type';
  if (node.type === 'protocol_function_declaration') return 'method';
  return node.type === 'function_declaration' ? callableKind(scope) : null;
};

export const swiftRules: LanguageRules = {
  descend: new Set([
    'source_file',
    'class_declaration',
    'class_body',
    'enum_class_body',
    'protocol_body',
  ]),
  kindOf: swiftKind,
  nameOf: (node) => fieldText(node, 'name'),
  exported: (node, _kind, scope) =>
    scope.exported &&
    (scope.implicitPublic || hasModifierWord(node, 'public') || hasModifierWord(node, 'open')),
  exempt: (node) => hasModifierWord(node, 'override'),
};
