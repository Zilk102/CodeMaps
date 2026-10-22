import type { EntityRecord, FileResolutionFacts } from '../types';

/** What a language extractor reads from the syntax tree beyond the generic query captures. */
export interface LanguageFacts extends FileResolutionFacts {
  /** Replaces the query's entity captures for this language. */
  entities: EntityRecord[];
}
