// Shapes of the copy-paste (clone) report that the main process returns to the Duplicates panel.
/**
 * One occurrence of a duplicated block: the file, its inclusive line range, and whether the file
 * is a test.
 */
export interface DuplicateCopy {
  file: string;
  startLine: number;
  endLine: number;
  test: boolean;
}

/** Refactoring the detector recommends for a group of clones. */
export type DuplicateAction = 'extract_function' | 'extract_shared_module' | 'merge_into_one';

/**
 * The detector's advice for one group: which refactoring to apply, where the shared code could
 * live, and why.
 */
export interface DuplicateSuggestion {
  action: DuplicateAction;
  sameFile: boolean;
  samePackage: boolean;
  parameters: number;
  targetFile?: string;
  reason: string;
}

/**
 * A set of near-identical code blocks, with their size, every copy, a suggested fix and how the
 * copies differ.
 */
export interface DuplicateGroup {
  id: string;
  lineCount: number;
  tokenCount: number;
  copies: DuplicateCopy[];
  suggestion: DuplicateSuggestion;
  differences: string[];
}

/**
 * Result of a duplicate scan: totals plus the groups that fit in the response (omittedGroups
 * counts the rest).
 */
export interface DuplicateReport {
  totalGroups: number;
  duplicatedLines: number;
  groups: DuplicateGroup[];
  omittedGroups: number;
}

/** IPC reply of the duplicate scan: the report on success, or an error message. */
export type DuplicatesResponse =
  { success: true; data: DuplicateReport } | { success: false; error: string };
