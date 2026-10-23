import {
  findMatchingBrace,
  findNextOpenBrace,
  getLineCountForRange,
  isInsideRanges,
} from './braceScanner';
import {
  LONG_METHOD_LINES,
  emptyMetrics,
  hashBody,
  isGodClassBySize,
  maxOf,
} from './structureRules';
import type { SourceClassMetric, SourceFileMetrics, SourceFunctionMetric } from './structureTypes';

const TOP_LEVEL_FUNCTION_REGEX =
  /(?:^|\n)\s*(?:export\s+)?(?:default\s+)?(?:async\s+)?function\s+([A-Za-z_$][\w$]*)\s*\([^)]*\)\s*(?::[^{\n]+)?\{|(?:^|\n)\s*(?:export\s+)?(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*(?:async\s*)?\([^)]*\)\s*=>\s*\{/gu;

const CLASS_REGEX = /\bclass\s+([A-Za-z_$][\w$]*)/gu;

const METHOD_REGEX =
  /(?:^|\n)\s*(?:(public|protected|private)\s+)?(?:(?:static|abstract|override|readonly|async|get|set)\s+)*(?!if\b|for\b|while\b|switch\b|catch\b|else\b|do\b|try\b)([A-Za-z_$][\w$]*)\s*(?:=\s*(?:async\s*)?\([^)]*\)\s*=>|\([^;=\n]*\)\s*(?::[^{=\n]+)?\s*)\{/gmu;

function analyzeClassBody(bodyText: string): {
  methods: SourceFunctionMetric[];
  publicMethodCount: number;
} {
  const methods: SourceFunctionMetric[] = [];
  let publicMethodCount = 0;
  let match: RegExpExecArray | null;

  METHOD_REGEX.lastIndex = 0;
  while ((match = METHOD_REGEX.exec(bodyText)) !== null) {
    const visibility = match[1];
    const methodName = match[2];
    const signature = match[0];
    const openBraceOffset = signature.lastIndexOf('{');
    if (openBraceOffset === -1) {
      continue;
    }

    const openBraceIndex = match.index + openBraceOffset;
    const closeBraceIndex = findMatchingBrace(bodyText, openBraceIndex);
    if (closeBraceIndex === -1) {
      continue;
    }

    methods.push(createRegexFunctionMetric(methodName, bodyText, openBraceIndex, closeBraceIndex));

    if (!visibility || visibility === 'public') {
      publicMethodCount += 1;
    }

    METHOD_REGEX.lastIndex = closeBraceIndex + 1;
  }

  return {
    methods,
    publicMethodCount,
  };
}

function createRegexFunctionMetric(
  name: string,
  text: string,
  openBraceIndex: number,
  closeBraceIndex: number
): SourceFunctionMetric {
  return {
    name,
    lineCount: getLineCountForRange(text, openBraceIndex, closeBraceIndex + 1),
    startLine: 0,
    endLine: 0,
    complexity: 1,
    branchCount: 0,
    maxNesting: 0,
    bodyHash: hashBody(text.slice(openBraceIndex, closeBraceIndex + 1)),
  };
}

interface RegexClassScan {
  ranges: Array<{ start: number; end: number }>;
  metrics: SourceClassMetric[];
  publicMethodCount: number;
  maxMethodLineCount: number;
}

function scanClassesWithRegex(text: string): RegexClassScan {
  const scan: RegexClassScan = {
    ranges: [],
    metrics: [],
    publicMethodCount: 0,
    maxMethodLineCount: 0,
  };
  let match: RegExpExecArray | null;

  CLASS_REGEX.lastIndex = 0;
  while ((match = CLASS_REGEX.exec(text)) !== null) {
    const openBraceIndex = findNextOpenBrace(text, match.index + match[0].length);
    if (openBraceIndex === -1) {
      continue;
    }

    const closeBraceIndex = findMatchingBrace(text, openBraceIndex);
    if (closeBraceIndex === -1) {
      continue;
    }

    scan.ranges.push({ start: match.index, end: closeBraceIndex });
    const classBody = text.slice(openBraceIndex + 1, closeBraceIndex);
    const { methods, publicMethodCount } = analyzeClassBody(classBody);
    const classMaxMethodLineCount = maxOf(methods, (item) => item.lineCount);

    scan.publicMethodCount += publicMethodCount;
    scan.maxMethodLineCount = Math.max(scan.maxMethodLineCount, classMaxMethodLineCount);
    scan.metrics.push({
      name: match[1],
      lineCount: getLineCountForRange(text, openBraceIndex, closeBraceIndex + 1),
      startLine: 0,
      endLine: 0,
      methodCount: methods.length,
      publicMethodCount,
      longMethodCount: methods.filter((item) => item.lineCount >= LONG_METHOD_LINES).length,
      complexMethodCount: 0,
      maxMethodLineCount: classMaxMethodLineCount,
      maxMethodComplexity: 1,
    });

    CLASS_REGEX.lastIndex = closeBraceIndex + 1;
  }

  return scan;
}

function scanTopLevelFunctionsWithRegex(
  text: string,
  classRanges: Array<{ start: number; end: number }>
): SourceFunctionMetric[] {
  const topLevelFunctions: SourceFunctionMetric[] = [];
  let match: RegExpExecArray | null;

  TOP_LEVEL_FUNCTION_REGEX.lastIndex = 0;
  while ((match = TOP_LEVEL_FUNCTION_REGEX.exec(text)) !== null) {
    const functionName = match[1] || match[2];
    const openBraceOffset = match[0].lastIndexOf('{');
    if (!functionName || openBraceOffset === -1) {
      continue;
    }

    const openBraceIndex = match.index + openBraceOffset;
    if (isInsideRanges(openBraceIndex, classRanges)) {
      continue;
    }

    const closeBraceIndex = findMatchingBrace(text, openBraceIndex);
    if (closeBraceIndex === -1) {
      continue;
    }

    topLevelFunctions.push(
      createRegexFunctionMetric(functionName, text, openBraceIndex, closeBraceIndex)
    );
    TOP_LEVEL_FUNCTION_REGEX.lastIndex = closeBraceIndex + 1;
  }

  return topLevelFunctions;
}

function longClassMethodPlaceholders(classMetrics: SourceClassMetric[]): SourceFunctionMetric[] {
  return classMetrics
    .filter((classMetric) => classMetric.maxMethodLineCount >= LONG_METHOD_LINES)
    .map((classMetric) => ({
      name: `${classMetric.name}::*`,
      lineCount: classMetric.maxMethodLineCount,
      startLine: classMetric.startLine,
      endLine: classMetric.endLine,
      complexity: 1,
      branchCount: 0,
      maxNesting: 0,
    }));
}

export function analyzeSourceFileStructureWithRegex(text: string | null): SourceFileMetrics {
  if (!text) {
    return emptyMetrics();
  }

  const classes = scanClassesWithRegex(text);
  const topLevelFunctions = scanTopLevelFunctionsWithRegex(text, classes.ranges);
  const maxMethodLineCount = Math.max(
    classes.maxMethodLineCount,
    maxOf(topLevelFunctions, (item) => item.lineCount)
  );

  return {
    classCount: classes.ranges.length,
    topLevelFunctionCount: topLevelFunctions.length,
    publicMethodCount: classes.publicMethodCount,
    maxMethodLineCount,
    godClasses: classes.metrics.filter(isGodClassBySize),
    longMethods: topLevelFunctions
      .filter((item) => item.lineCount >= LONG_METHOD_LINES)
      .concat(longClassMethodPlaceholders(classes.metrics)),
    complexMethods: [],
    allFunctions: topLevelFunctions,
  };
}
