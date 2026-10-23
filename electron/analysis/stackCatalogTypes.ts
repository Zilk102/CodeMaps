export type StackCategory = 'package_manager' | 'build_system' | 'framework';
export type StackConfidence = 'high' | 'medium';

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

export interface StackDefinition {
  id: string;
  displayName: string;
  category: StackCategory;
  ecosystem: string;
  confidence: StackConfidence;
  matchMode?: 'all' | 'any';
  rules: StackDetectionRule[];
}
