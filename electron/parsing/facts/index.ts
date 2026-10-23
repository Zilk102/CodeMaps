import type { Node } from 'web-tree-sitter';
import { extractCppFacts } from './cppFacts';
import { extractCSharpFacts } from './csharpFacts';
import { extractGoFacts } from './goFacts';
import { extractJavaFacts } from './javaFacts';
import { extractKotlinFacts } from './kotlinFacts';
import { extractPhpFacts } from './phpFacts';
import { extractPythonFacts } from './pythonFacts';
import { extractRubyFacts } from './rubyFacts';
import { extractRustFacts } from './rustFacts';
import type { LanguageFacts, LanguageFactsWithDeclarations } from './types';

const EXTRACTORS: Record<string, (root: Node) => LanguageFactsWithDeclarations> = {
  go: extractGoFacts,
  python: extractPythonFacts,
  java: extractJavaFacts,
  rust: extractRustFacts,
  cpp: extractCppFacts,
  c_sharp: extractCSharpFacts,
  kotlin: extractKotlinFacts,
  php: extractPhpFacts,
  ruby: extractRubyFacts,
};

/** Languages whose imports are resolved against the whole project after indexing. */
export const hasLanguageFacts = (languageId: string): boolean => languageId in EXTRACTORS;

/** Plain, serializable facts: safe to return from a parse worker. */
export const extractLanguageFacts = (languageId: string, root: Node): LanguageFacts | null => {
  const full = EXTRACTORS[languageId]?.(root);
  if (!full) return null;
  const { declarations: _declarations, ...facts } = full;
  void _declarations;
  return facts;
};

/** Facts together with the declaring syntax nodes, for analyses that stay in one process. */
export const extractLanguageFactsWithDeclarations = (
  languageId: string,
  root: Node
): LanguageFactsWithDeclarations | null => EXTRACTORS[languageId]?.(root) ?? null;

export type { LanguageFacts, LanguageFactsWithDeclarations };
