// Shapes of the per-file structure metrics.
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
