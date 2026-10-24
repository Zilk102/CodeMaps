import type { Node } from 'web-tree-sitter';
import type { ImportRecord, QualifiedUse } from '../types';
import {
  BoundedSet,
  EntityCollector,
  MAX_QUALIFIED_USES,
  MAX_USED_NAMES,
  walkNamed,
} from './astUtils';
import type { LanguageFactsWithDeclarations } from './types';

/** Shared state every AST-walking facts extractor fills in. */
export class FactsAccumulator {
  readonly imports: ImportRecord[] = [];
  readonly entities: EntityCollector;
  private readonly usedNames = new BoundedSet<string>(MAX_USED_NAMES);
  private readonly qualifiedUses = new BoundedSet<QualifiedUse>(MAX_QUALIFIED_USES);

  constructor(uniqueEntityNames = false) {
    this.entities = new EntityCollector(uniqueEntityNames);
  }

  /** Records an identifier-like node as a used name (single characters are noise). */
  noteIdentifier(node: Node): void {
    if (node.text.length > 1) this.usedNames.add(node.text, node.text);
  }

  noteQualified(separator: string, qualifier: string, name: string): void {
    this.qualifiedUses.add(`${qualifier}${separator}${name}`, { qualifier, name });
  }

  toFacts<Extra extends object>(extra: Extra): LanguageFactsWithDeclarations & Extra {
    return {
      imports: this.imports,
      entities: this.entities.entities,
      declarations: this.entities.declarations,
      qualifiedUses: this.qualifiedUses.toArray(),
      usedNames: this.usedNames.toArray(),
      ...extra,
    };
  }
}

/** Handler return value follows `walkNamed`: false skips the node's subtree. */
export type NodeHandler<State> = (node: Node, state: State) => boolean;

/** Handler for a state that carries the accumulator. */
type WithAccumulator = { acc: FactsAccumulator };

/**
 * Handler that notes `<qualifier><separator><name>` for nodes whose qualifier field is a plain
 * identifier (`pkg.Name`, `Module::Item`) and descends.
 */
export const qualifiedUseHandler =
  (separator: string, qualifierField: string, nameField: string): NodeHandler<WithAccumulator> =>
  (node, { acc }) => {
    const qualifier = node.childForFieldName(qualifierField);
    const name = node.childForFieldName(nameField);
    if (qualifier?.type === 'identifier' && name) {
      acc.noteQualified(separator, qualifier.text, name.text);
    }
    return true;
  };

/** Handler that records the imports `read` finds in a node and skips the node's subtree. */
export const importsHandler =
  (read: (node: Node) => ImportRecord[]): NodeHandler<WithAccumulator> =>
  (node, { acc }) => {
    acc.imports.push(...read(node));
    return false;
  };

/** Like `importsHandler` for a node that holds at most one import. */
export const importHandler = (read: (node: Node) => ImportRecord | null) =>
  importsHandler((node) => {
    const record = read(node);
    return record ? [record] : [];
  });

/** Handler that declares a class-like entity for nodes of the given types and descends. */
export const declareClassLike =
  (types: ReadonlySet<string>): NodeHandler<WithAccumulator> =>
  (node, { acc }) => {
    if (types.has(node.type)) {
      const name = node.childForFieldName('name');
      if (name) acc.entities.add('class', name.text, name);
    }
    return true;
  };

/** Walks the tree, handing each node to its handler (or `fallback`) with the shared state. */
export const walkWithHandlers = <S>(
  root: Node,
  state: S,
  handlers: Record<string, NodeHandler<S>>,
  fallback: NodeHandler<S> = () => true
): void => walkNamed(root, (node) => (handlers[node.type] ?? fallback)(node, state));

/** State of the languages whose files declare namespaces (C#, PHP). */
export interface NamespaceState {
  acc: FactsAccumulator;
  namespaces: string[];
}

/** Facts of a namespaced file: the first namespace doubles as its package name. */
export const namespaceFacts = ({ acc, namespaces }: NamespaceState) =>
  acc.toFacts({ packageName: namespaces[0], namespaces });
