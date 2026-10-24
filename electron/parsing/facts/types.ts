// Types of the facts that language extractors read from the syntax tree.

import type { Node } from 'web-tree-sitter';
import type { EntityRecord, FileResolutionFacts } from '../types';

/** What a language extractor reads from the syntax tree beyond the generic query captures. */
export interface LanguageFacts extends FileResolutionFacts {
  /** Replaces the query's entity captures for this language. */
  entities: EntityRecord[];
}

/** A declared entity together with the syntax node that declares it. */
export interface DeclarationNode {
  type: EntityRecord['type'];
  name: string;
  node: Node;
}

/** Facts plus live syntax nodes; only for in-process analysis, never sent across workers. */
export interface LanguageFactsWithDeclarations extends LanguageFacts {
  declarations: DeclarationNode[];
}
