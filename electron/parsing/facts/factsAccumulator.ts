import type { Node } from 'web-tree-sitter';
import type { ImportRecord, QualifiedUse } from '../types';
import { BoundedSet, EntityCollector, MAX_QUALIFIED_USES, MAX_USED_NAMES } from './astUtils';
import type { LanguageFactsWithDeclarations } from './types';

/** Shared state every AST-walking facts extractor fills in. */
export class FactsAccumulator {
  readonly imports: ImportRecord[] = [];
  readonly entities = new EntityCollector();
  private readonly usedNames = new BoundedSet<string>(MAX_USED_NAMES);
  private readonly qualifiedUses = new BoundedSet<QualifiedUse>(MAX_QUALIFIED_USES);

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
