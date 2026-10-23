export interface DuplicateCopy {
  /** Project-relative, forward slashes. */
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
  /** How many positions differ between the copies; -1 when the copies could not be aligned. */
  parameters: number;
  /** Project-relative home for the shared code. */
  targetFile?: string;
  /** One sentence an agent can act on. */
  reason: string;
}

export interface DuplicateGroup {
  id: string;
  lineCount: number;
  tokenCount: number;
  copies: DuplicateCopy[];
  suggestion: DuplicateSuggestion;
  /** Up to five short samples, e.g. "users.go:12 `user` vs orders.go:30 `order`". */
  differences: string[];
}

export interface DuplicateReport {
  totalGroups: number;
  /** Sum over groups of lineCount * (copies - 1): the lines that removing the copies saves. */
  duplicatedLines: number;
  /** Worst first, capped by `limit`. */
  groups: DuplicateGroup[];
  omittedGroups: number;
}

export interface DuplicateReportOptions {
  limit?: number;
  minLines?: number;
  includeTests?: boolean;
  /** Only groups with a copy in this file (absolute or project-relative). */
  filePath?: string;
}
