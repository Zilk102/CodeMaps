import type { Node } from 'web-tree-sitter';
import type { EntityRecord, SourceLocation } from '../types';
import type { DeclarationNode } from './types';

export const MAX_USED_NAMES = 600;
export const MAX_QUALIFIED_USES = 400;

export const toLocation = (node: Node): SourceLocation => ({
  startLine: node.startPosition.row + 1,
  startColumn: node.startPosition.column + 1,
  endLine: node.endPosition.row + 1,
  endColumn: node.endPosition.column + 1,
});

/** Depth-first walk over named nodes; `visit` returns false to skip a subtree. */
export const walkNamed = (root: Node, visit: (node: Node) => boolean | void): void => {
  const stack: Node[] = [root];
  while (stack.length > 0) {
    const node = stack.pop()!;
    if (visit(node) === false) continue;
    const children = namedOf(node);
    for (let index = children.length - 1; index >= 0; index -= 1) stack.push(children[index]);
  }
};

/** Named children without the nullable holes the typings allow for. */
export const namedOf = (node: Node): Node[] =>
  node.namedChildren.filter((child): child is Node => !!child);

export const allChildren = (node: Node): Node[] =>
  node.children.filter((child): child is Node => !!child);

export const fieldChildren = (node: Node, field: string): Node[] =>
  node.childrenForFieldName(field).filter((child): child is Node => !!child);

export const unquote = (value: string): string => value.replace(/^["'`]|["'`]$/g, '');

/** Collects entities once per `type:name`, like the query extractor does. */
export class EntityCollector {
  readonly entities: EntityRecord[] = [];
  /** The syntax node that declares each entity (the parent of its name), for split planning. */
  readonly declarations: DeclarationNode[] = [];
  private readonly seen = new Set<string>();

  /**
   * With `uniqueNames` a class and a function of the same name are one entity: graph node ids
   * are `file#name`, so languages that allow such pairs (C's `struct stat` and `stat()`) would
   * otherwise produce two nodes with one id.
   */
  constructor(private readonly uniqueNames = false) {}

  add(type: EntityRecord['type'], name: string, node: Node): void {
    const trimmed = name.trim();
    if (!trimmed) return;
    const key = this.uniqueNames ? trimmed : `${type}:${trimmed}`;
    if (this.seen.has(key)) return;
    this.seen.add(key);
    this.entities.push({ type, name: trimmed, location: toLocation(node) });
    this.declarations.push({ type, name: trimmed, node: node.parent ?? node });
  }
}

/** Bounded unique collector for names and qualified uses. */
export class BoundedSet<T> {
  private readonly values = new Map<string, T>();
  constructor(private readonly limit: number) {}

  add(key: string, value: T): void {
    if (this.values.size >= this.limit || this.values.has(key)) return;
    this.values.set(key, value);
  }

  toArray(): T[] {
    return [...this.values.values()];
  }
}

/** Declares a function named by the node's `name` field, qualified by its owner when it has one. */
export const addOwnedFunction = (
  entities: EntityCollector,
  node: Node,
  owner: string | undefined,
  separator = '.'
): void => {
  const name = node.childForFieldName('name');
  if (name) entities.add('function', owner ? `${owner}${separator}${name.text}` : name.text, name);
};
