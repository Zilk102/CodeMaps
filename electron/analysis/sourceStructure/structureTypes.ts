// Shapes of the per-file structure metrics.

/** Size and complexity of one function or method. */
export interface SourceFunctionMetric {
  name: string;
  lineCount: number;
  startLine: number;
  endLine: number;
  complexity: number;
  branchCount: number;
  maxNesting: number;
  bodyHash?: string;
}

/** Size and method statistics of one class. */
export interface SourceClassMetric {
  name: string;
  lineCount: number;
  startLine: number;
  endLine: number;
  methodCount: number;
  publicMethodCount: number;
  longMethodCount: number;
  complexMethodCount: number;
  maxMethodLineCount: number;
  maxMethodComplexity: number;
}

/**
 * Structure summary of a source file: counts plus the classes and functions that exceed the
 * thresholds of `structureRules`.
 */
export interface SourceFileMetrics {
  classCount: number;
  topLevelFunctionCount: number;
  publicMethodCount: number;
  maxMethodLineCount: number;
  godClasses: SourceClassMetric[];
  longMethods: SourceFunctionMetric[];
  complexMethods: SourceFunctionMetric[];
  allFunctions: SourceFunctionMetric[];
}
