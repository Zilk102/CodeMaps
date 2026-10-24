/** Data model of the stack catalog: what a stack definition and its detection rules look like. */
/**
 * What a stack is for in the project: how dependencies are installed, how it is built, or what it is built with.
 */
export type StackCategory = 'package_manager' | 'build_system' | 'framework';
/**
 * How reliable a match is: 'high' for decisive evidence (config file), 'medium' for weaker hints.
 */
export type StackConfidence = 'high' | 'medium';

/**
 * One test against the project's files that yields evidence when it passes. Paths are relative to
 * the project root and compared case-insensitively; `anyOf` rules pass when any listed candidate
 * is found, and `file` names a root-level file such as package.json.
 */
export type StackDetectionRule =
  | {
      type: 'relative_path';
      anyOf: string[];
    }
  | {
      type: 'basename';
      anyOf: string[];
    }
  | {
      type: 'suffix';
      anyOf: string[];
    }
  | {
      type: 'json_dependency';
      file: string;
      sections: string[];
      anyOf: string[];
    }
  | {
      type: 'json_field_includes';
      file: string;
      field: string;
      anyOf: string[];
    }
  | {
      type: 'text_contains';
      file: string;
      anyOf: string[];
    }
  | {
      type: 'text_contains_in_suffix';
      suffixes: string[];
      anyOf: string[];
    };

/**
 * A stack that can be detected. With `matchMode` 'all' every rule must match, otherwise (default) one is enough.
 */
export interface StackDefinition {
  id: string;
  displayName: string;
  category: StackCategory;
  ecosystem: string;
  confidence: StackConfidence;
  matchMode?: 'all' | 'any';
  rules: StackDetectionRule[];
}
