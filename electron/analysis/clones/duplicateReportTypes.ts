// Public shapes of the duplication report returned by the MCP tool.

/** Location of one copy of duplicated code. */
export interface DuplicateCopy {
  /** Project-relative, forward slashes. */
  file: string;
  startLine: number;
  endLine: number;
  test: boolean;
}

/**
 * Kind of refactoring proposed for a group: pull out a function, move code to a shared module, or
 * keep one identical copy.
 */
export type DuplicateAction = 'extract_function' | 'extract_shared_module' | 'merge_into_one';

/** Where and how to remove a group of copies. */
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

/** One set of copies of the same code with the advice for removing it. */
export interface DuplicateGroup {
  id: string;
  lineCount: number;
  tokenCount: number;
  copies: DuplicateCopy[];
  suggestion: DuplicateSuggestion;
  /** Up to five short samples, e.g. "users.go:12 `user` vs orders.go:30 `order`". */
  differences: string[];
}

/**
 * The duplicated code of a project, worst groups first, with totals that cover groups beyond the
 * `limit`.
 */
export interface DuplicateReport {
  totalGroups: number;
  /** Sum over groups of lineCount * (copies - 1): the lines that removing the copies saves. */
  duplicatedLines: number;
  /** Worst first, capped by `limit`. */
  groups: DuplicateGroup[];
  omittedGroups: number;
}

/**
 * Filters of the report; omitted fields mean no filter (default `limit` is 10, tests are excluded).
 */
export interface DuplicateReportOptions {
  limit?: number;
  minLines?: number;
  includeTests?: boolean;
  /** Only groups with a copy in this file (absolute or project-relative). */
  filePath?: string;
}
