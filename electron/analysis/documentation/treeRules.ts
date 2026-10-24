/**
 * The contract between the generic tree-sitter declaration walker and the per-language rules, plus
 * the small node helpers the rules share. A language is described by a `LanguageRules` object;
 * the walker in `declarationsTreeSitter.ts` does the rest.
 */
import type { Node } from 'web-tree-sitter';
import type { SymbolKind } from './types';

/** What encloses a declaration: decides the visibility of its members. */
export interface Scope {
  /** The enclosing symbol is visible outside the file, so its public members are too. */
  exported: boolean;
  /** Members are public without a modifier (interfaces, traits, protocols). */
  implicitPublic: boolean;
  /** Nothing inside is required (trait implementations). */
  exempt: boolean;
  /** The enclosing symbol kind, or null at the top of the file or inside a namespace. */
  kind: SymbolKind | null;
}

/** Facts about the file being read that rules may depend on. */
export interface FileEnv {
  file: string;
  /** Lower-cased with the dot. */
  extension: string;
}

/** How one language maps its syntax tree onto documentable declarations. */
export interface LanguageRules {
  /** Node types the walker enters besides declarations and the root. */
  descend: ReadonlySet<string>;
  /** The kind of symbol a node declares, or null when it is not documentable. */
  kindOf(node: Node, scope: Scope): SymbolKind | null;
  nameOf(node: Node): string | null;
  /** Whether the symbol is visible outside its file or class. */
  exported(node: Node, kind: SymbolKind, scope: Scope, env: FileEnv): boolean;
  /** Extra reasons to never require docs (`override`, out-of-line definitions). */
  exempt?(node: Node, kind: SymbolKind): boolean;
  /** The node whose first line the doc comment sits above (a wrapper or the first attribute). */
  anchorOf?(node: Node): Node;
  /** The scope inside a node that is a container but not a symbol (`impl`, `mod`, `namespace`). */
  scopeOf?(node: Node, scope: Scope): Scope | null;
  /** Whether symbols at the top of the file are exported (false for private Python modules). */
  rootExported?(env: FileEnv): boolean;
  /** Docstring languages: the docstring of a declaration, or null when it has none. */
  docstring?(node: Node): string | null;
  /** Docstring languages: the module docstring, or null when it has none. */
  moduleDocstring?(root: Node): string | null;
}

/** Whether a symbol kind is a function or method, whose bodies are not searched. */
export const isCallableKind = (kind: SymbolKind): boolean =>
  kind === 'function' || kind === 'method';

/** The kind of a function node: a method inside a type, a function at the top of the file. */
export const callableKind = (scope: Scope): SymbolKind => (scope.kind ? 'method' : 'function');

/**
 * The kind a node declares, read from the first child whose type is in the table (the keyword
 * `struct` in Swift, the `struct_declaration` body in Zig). A null entry means "not documented".
 */
export const kindFromChild = (
  node: Node,
  table: ReadonlyMap<string, SymbolKind | null>
): SymbolKind | null => {
  const found = node.children.find((child) => child && table.has(child.type));
  return found ? (table.get(found.type) ?? null) : null;
};

/** The text of a named field of a node, or null. */
export const fieldText = (node: Node, field: string): string | null =>
  node.childForFieldName(field)?.text ?? null;

/** The first child of a node whose type is one of `types`. */
export const childOfType = (node: Node, ...types: string[]): Node | null =>
  node.children.find((child) => child !== null && types.includes(child.type)) ?? null;

/** Whether the node has a direct child of one of the types. */
export const hasChildOfType = (node: Node, ...types: string[]): boolean =>
  childOfType(node, ...types) !== null;

/** Text of a node's modifier children (`modifiers`, `modifier`, `visibility_modifier`). */
export const modifierText = (node: Node): string =>
  node.children
    .flatMap((child) =>
      child && /^(modifiers?|visibility_modifier)$/.test(child.type) ? [child] : []
    )
    .map((child) => child.text)
    .join(' ');

/** Whether a modifier word appears among the node's modifiers. */
export const hasModifierWord = (node: Node, word: string): boolean =>
  new RegExp(`(^|[^\\w])${word}([^\\w]|$)`).test(modifierText(node));

/** The nearest previous named sibling whose type is one of `types`. */
export const previousSiblingOfType = (node: Node, ...types: string[]): Node | null => {
  for (let sibling = node.previousNamedSibling; sibling; sibling = sibling.previousNamedSibling) {
    if (types.includes(sibling.type)) return sibling;
  }
  return null;
};
