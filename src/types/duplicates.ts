export interface DuplicateCopy {
  file: string;
  startLine: number;
  endLine: number;
  test: boolean;
}

export type DuplicateAction = 'extract_function' | 'extract_shared_module' | 'merge_into_one';

export interface DuplicateSuggestion {
  action: DuplicateAction;
  sameFile: boolean;
  samePackage: boolean;
  parameters: number;
  targetFile?: string;
  reason: string;
}

export interface DuplicateGroup {
  id: string;
  lineCount: number;
  tokenCount: number;
  copies: DuplicateCopy[];
  suggestion: DuplicateSuggestion;
  differences: string[];
}

export interface DuplicateReport {
  totalGroups: number;
  duplicatedLines: number;
  groups: DuplicateGroup[];
  omittedGroups: number;
}

export type DuplicatesResponse =
  { success: true; data: DuplicateReport } | { success: false; error: string };
