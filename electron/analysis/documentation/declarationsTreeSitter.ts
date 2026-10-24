/**
 * The generic declaration walker for every tree-sitter language. It enters only the node types a
 * language lists as containers, asks the language rules what each node declares, and never looks
 * inside function bodies, so a scan touches a small part of the tree.
 */
import type { Node } from 'web-tree-sitter';
import type { DeclarationScan, RawDeclaration } from './declarations';
import { isCallableKind, type FileEnv, type LanguageRules, type Scope } from './treeRules';
import type { SymbolKind } from './types';

interface Described {
  declaration: RawDeclaration;
  /** The scope inside the declaration. */
  inner: Scope;
}

interface Walk {
  root: Node;
  rules: LanguageRules;
  env: FileEnv;
}

const buildDeclaration = (
  node: Node,
  facts: { kind: SymbolKind; name: string; exported: boolean; exempt: boolean },
  rules: LanguageRules
): RawDeclaration => ({
  ...facts,
  line: node.startPosition.row + 1,
  endLine: node.endPosition.row + 1,
  anchorLine: (rules.anchorOf?.(node) ?? node).startPosition.row + 1,
  docstring: rules.docstring ? rules.docstring(node) : undefined,
});

const describeNode = (node: Node, scope: Scope, walk: Walk): Described | null => {
  const { rules, env } = walk;
  const kind = rules.kindOf(node, scope);
  const name = kind ? rules.nameOf(node) : null;
  if (!kind || !name) return null;
  const exported = rules.exported(node, kind, scope, env);
  const exempt = scope.exempt || (rules.exempt?.(node, kind) ?? false);
  return {
    declaration: buildDeclaration(node, { kind, name, exported, exempt }, rules),
    inner: { exported, implicitPublic: kind === 'interface' || kind === 'trait', exempt, kind },
  };
};

const pushChildren = (stack: [Node, Scope][], node: Node, scope: Scope): void => {
  for (let index = node.childCount - 1; index >= 0; index -= 1) {
    const child = node.child(index);
    if (child?.isNamed) stack.push([child, scope]);
  }
};

/** Whether the walker looks at the children of a node: containers and non-callable symbols. */
const isEntered = (node: Node, found: Described | null, walk: Walk): boolean => {
  if (found) return !isCallableKind(found.declaration.kind);
  return node === walk.root || walk.rules.descend.has(node.type);
};

const scopeInside = (node: Node, scope: Scope, found: Described | null, walk: Walk): Scope =>
  found?.inner ?? walk.rules.scopeOf?.(node, scope) ?? scope;

/** The declarations of a parsed file, in source order. */
export const scanTreeDeclarations = (
  root: Node,
  rules: LanguageRules,
  env: FileEnv
): DeclarationScan => {
  const walk: Walk = { root, rules, env };
  const top: Scope = {
    exported: rules.rootExported?.(env) ?? true,
    implicitPublic: false,
    exempt: false,
    kind: null,
  };
  const declarations: RawDeclaration[] = [];
  const stack: [Node, Scope][] = [[root, top]];
  for (let item = stack.pop(); item; item = stack.pop()) {
    const [node, scope] = item;
    const found = describeNode(node, scope, walk);
    if (found) declarations.push(found.declaration);
    if (isEntered(node, found, walk))
      pushChildren(stack, node, scopeInside(node, scope, found, walk));
  }
  return { declarations, moduleDocstring: rules.moduleDocstring?.(root) };
};
