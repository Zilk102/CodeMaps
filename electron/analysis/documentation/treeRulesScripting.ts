/**
 * Declaration rules of the scripting languages: Python (docstrings), Ruby (YARD comments),
 * PHP (PHPDoc) and Bash (comment above the function).
 */
import type { Node } from 'web-tree-sitter';
import { fieldText, modifierText, type LanguageRules, type Scope } from './treeRules';
import type { SymbolKind } from './types';

// ---- Python -----------------------------------------------------------------------------

const QUOTES = /^[rRuUbBfF]*("""|'''|"|')|("""|'''|"|')$/g;

/** The text of the first statement of a block when it is a string, which Python calls the docstring. */
const leadingString = (container: Node | null): string | null => {
  const first = container?.namedChildren.find((child) => child && child.type !== 'comment');
  const string = first?.type === 'expression_statement' ? first.namedChild(0) : null;
  return string?.type === 'string' ? string.text.replace(QUOTES, '').trim() : null;
};

const pythonKind = (node: Node, scope: Scope): SymbolKind | null => {
  if (node.type === 'class_definition') return 'class';
  if (node.type !== 'function_definition') return null;
  return scope.kind === 'class' ? 'method' : 'function';
};

const fileBaseName = (file: string): string => file.replace(/\\/g, '/').split('/').pop() ?? file;

const DUNDER = /^__.+__$/;

export const pythonRules: LanguageRules = {
  descend: new Set(['module', 'class_definition', 'block', 'decorated_definition']),
  kindOf: pythonKind,
  nameOf: (node) => fieldText(node, 'name'),
  exported: (node, _kind, scope) => {
    const name = fieldText(node, 'name') ?? '';
    return scope.exported && !name.startsWith('_') && !DUNDER.test(name);
  },
  rootExported: (env) => {
    const base = fileBaseName(env.file);
    return !base.startsWith('_') || base === '__init__.py';
  },
  docstring: (node) => leadingString(node.childForFieldName('body')),
  moduleDocstring: leadingString,
};

// ---- Ruby -------------------------------------------------------------------------------

const RUBY_VISIBILITY = new Set(['public', 'private', 'protected']);

/** The visibility a bare `private`/`protected`/`public` line above a method switched to. */
const rubyVisibility = (node: Node): string => {
  for (let sibling = node.previousNamedSibling; sibling; sibling = sibling.previousNamedSibling) {
    if (sibling.type === 'identifier' && RUBY_VISIBILITY.has(sibling.text)) return sibling.text;
  }
  return 'public';
};

const rubyKind = (node: Node, scope: Scope): SymbolKind | null => {
  if (node.type === 'class' || node.type === 'module') return 'class';
  if (node.type === 'singleton_method') return 'method';
  if (node.type !== 'method') return null;
  return scope.kind ? 'method' : 'function';
};

export const rubyRules: LanguageRules = {
  descend: new Set(['program', 'class', 'module', 'body_statement', 'singleton_class']),
  kindOf: rubyKind,
  nameOf: (node) => fieldText(node, 'name'),
  exported: (node, _kind, scope) =>
    scope.exported && (node.type !== 'method' || rubyVisibility(node) === 'public'),
};

// ---- PHP --------------------------------------------------------------------------------

const PHP_KINDS = new Map<string, SymbolKind>([
  ['class_declaration', 'class'],
  ['interface_declaration', 'interface'],
  ['trait_declaration', 'trait'],
  ['enum_declaration', 'enum'],
  ['function_definition', 'function'],
  ['method_declaration', 'method'],
]);

export const phpRules: LanguageRules = {
  descend: new Set(['program', 'declaration_list', 'namespace_definition', 'compound_statement']),
  kindOf: (node) => PHP_KINDS.get(node.type) ?? null,
  nameOf: (node) => fieldText(node, 'name'),
  exported: (node, _kind, scope) => scope.exported && !/private|protected/.test(modifierText(node)),
};

// ---- Bash -------------------------------------------------------------------------------

export const bashRules: LanguageRules = {
  descend: new Set(['program']),
  kindOf: (node) => (node.type === 'function_definition' ? 'function' : null),
  nameOf: (node) => fieldText(node, 'name'),
  exported: () => true,
};
