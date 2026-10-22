import type { Node } from 'web-tree-sitter';
import { extractGoFacts } from './goFacts';
import { extractJavaFacts } from './javaFacts';
import { extractPythonFacts } from './pythonFacts';
import { extractRustFacts } from './rustFacts';
import type { LanguageFacts } from './types';

const EXTRACTORS: Record<string, (root: Node) => LanguageFacts> = {
  go: extractGoFacts,
  python: extractPythonFacts,
  java: extractJavaFacts,
  rust: extractRustFacts,
};

/** Languages whose imports are resolved against the whole project after indexing. */
export const hasLanguageFacts = (languageId: string): boolean => languageId in EXTRACTORS;

export const extractLanguageFacts = (languageId: string, root: Node): LanguageFacts | null =>
  EXTRACTORS[languageId]?.(root) ?? null;

export type { LanguageFacts };
