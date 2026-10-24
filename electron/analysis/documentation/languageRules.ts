/**
 * Registry of the tree-sitter declaration rules by language id. TypeScript, JavaScript, TSX and
 * Vue are read with the TypeScript compiler API and have no entry here.
 */
import { csharpRules, javaRules, kotlinRules, swiftRules } from './treeRulesManaged';
import { bashRules, phpRules, pythonRules, rubyRules } from './treeRulesScripting';
import { goRules, rustRules, zigRules } from './treeRulesSystems';
import { cppRules } from './treeRulesCpp';
import type { LanguageRules } from './treeRules';

const RULES_BY_LANGUAGE = new Map<string, LanguageRules>([
  ['python', pythonRules],
  ['go', goRules],
  ['rust', rustRules],
  ['java', javaRules],
  ['cpp', cppRules],
  ['c_sharp', csharpRules],
  ['php', phpRules],
  ['ruby', rubyRules],
  ['zig', zigRules],
  ['swift', swiftRules],
  ['kotlin', kotlinRules],
  ['bash', bashRules],
]);

/** The declaration rules of a tree-sitter language, or undefined for any other language. */
export const rulesForLanguage = (language: string): LanguageRules | undefined =>
  RULES_BY_LANGUAGE.get(language);
