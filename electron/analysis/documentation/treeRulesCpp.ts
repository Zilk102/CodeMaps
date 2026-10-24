/**
 * Declaration rules of C and C++: classes, structs, enums, typedefs, functions and the prototypes
 * of headers. Doxygen comments (block comments with a double star, `///` and `//!`) document them.
 */
import type { Node } from 'web-tree-sitter';
import { previousSiblingOfType, type LanguageRules, type Scope } from './treeRules';
import type { SymbolKind } from './types';

const HEADER_EXTENSIONS = new Set(['.h', '.hh', '.hpp', '.hxx']);

const TYPE_SPECIFIERS = new Map<string, SymbolKind>([
  ['class_specifier', 'class'],
  ['struct_specifier', 'struct'],
  ['union_specifier', 'struct'],
  ['enum_specifier', 'enum'],
]);

/** The `function_declarator` under a declarator chain (`*f(int)` is a pointer to a function). */
const functionDeclarator = (node: Node): Node | null => {
  let declarator = node.childForFieldName('declarator');
  while (declarator && declarator.type !== 'function_declarator') {
    declarator = declarator.childForFieldName('declarator');
  }
  return declarator;
};

/** The name node of a function: constructors, destructors and operators have none worth documenting. */
const functionNameNode = (node: Node): Node | null => {
  const name = functionDeclarator(node)?.childForFieldName('declarator');
  return name && /^(identifier|field_identifier|qualified_identifier)$/.test(name.type)
    ? name
    : null;
};

/** `typedef struct Name { ... } Name;` is documented on the struct, not on the typedef. */
const typedefRepeatsNamedBody = (node: Node): boolean => {
  const type = node.childForFieldName('type');
  return !!type?.childForFieldName('body') && !!type.childForFieldName('name');
};

const isFunctionLike = (node: Node): boolean =>
  (node.type === 'function_definition' && node.childForFieldName('type') !== null) ||
  ((node.type === 'declaration' || node.type === 'field_declaration') &&
    functionDeclarator(node) !== null);

const cppKind = (node: Node, scope: Scope): SymbolKind | null => {
  const typeKind = TYPE_SPECIFIERS.get(node.type);
  if (typeKind) return node.childForFieldName('body') ? typeKind : null;
  if (node.type === 'alias_declaration') return 'type';
  if (node.type === 'type_definition') return typedefRepeatsNamedBody(node) ? null : 'type';
  if (!isFunctionLike(node)) return null;
  return scope.kind ? 'method' : 'function';
};

const cppName = (node: Node): string | null => {
  if (node.type === 'type_definition') return node.childForFieldName('declarator')?.text ?? null;
  if (isFunctionLike(node)) return functionNameNode(node)?.text ?? null;
  return node.childForFieldName('name')?.text ?? null;
};

const isStatic = (node: Node): boolean =>
  node.children.some(
    (child) => child?.type === 'storage_class_specifier' && child.text === 'static'
  );

/** The access in force at a class member: the nearest `public:`/`private:` label above it. */
const memberIsPublic = (node: Node, scope: Scope): boolean => {
  const label = previousSiblingOfType(node, 'access_specifier');
  return label ? label.text === 'public' : scope.kind === 'struct';
};

const cppExported = (node: Node, kind: SymbolKind, scope: Scope, extension: string): boolean => {
  if (!scope.exported) return false;
  if (scope.kind === 'class' || scope.kind === 'struct') return memberIsPublic(node, scope);
  if (kind === 'function')
    return !isStatic(node) && (node.type !== 'declaration' || isHeader(extension));
  return isHeader(extension);
};

const isHeader = (extension: string): boolean => HEADER_EXTENSIONS.has(extension);

export const cppRules: LanguageRules = {
  descend: new Set([
    'translation_unit',
    'namespace_definition',
    'declaration_list',
    'linkage_specification',
    'template_declaration',
    'field_declaration_list',
    'preproc_if',
    'preproc_ifdef',
    'preproc_else',
    'preproc_elif',
  ]),
  kindOf: cppKind,
  nameOf: cppName,
  exported: (node, kind, scope, env) => cppExported(node, kind, scope, env.extension),
  // Out-of-line definitions (`int Foo::bar()`) are documented where the class declares them.
  exempt: (node) => functionNameNode(node)?.type === 'qualified_identifier',
  anchorOf: (node) => (node.parent?.type === 'template_declaration' ? node.parent : node),
};
