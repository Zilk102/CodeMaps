// Regex-and-brace fallback that measures classes and functions when the TypeScript analysis yields
// nothing. Reports line counts only: complexity and nesting are fixed placeholders.

import {
  findMatchingBrace,
  findNextOpenBrace,
  getLineCountForRange,
  isInsideRanges,
} from './braceScanner';
import { DEFAULT_STRUCTURE_LIMITS, type StructureLimits } from '../projectConfig/structureLimits';
import { emptyMetrics, hashBody, isGodClassBySize, isLongFunction, maxOf } from './structureRules';
import type { SourceClassMetric, SourceFileMetrics, SourceFunctionMetric } from './structureTypes';

const TOP_LEVEL_FUNCTION_REGEX =
  /(?:^|\n)\s*(?:export\s+)?(?:default\s+)?(?:async\s+)?function\s+([A-Za-z_$][\w$]*)\s*\([^)]*\)\s*(?::[^{\n]+)?\{|(?:^|\n)\s*(?:export\s+)?(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*(?:async\s*)?\([^)]*\)\s*=>\s*\{/gu;

const CLASS_REGEX = /\bclass\s+([A-Za-z_$][\w$]*)/gu;

const METHOD_REGEX =
  /(?:^|\n)\s*(?:(public|protected|private)\s+)?(?:(?:static|abstract|override|readonly|async|get|set)\s+)*(?!if\b|for\b|while\b|switch\b|catch\b|else\b|do\b|try\b)([A-Za-z_$][\w$]*)\s*(?:=\s*(?:async\s*)?\([^)]*\)\s*=>|\([^;=\n]*\)\s*(?::[^{=\n]+)?\s*)\{/gmu;

/**
 * Finds the methods in the body of one class and counts the public ones (no modifier or `public`).
 * Methods whose braces do not balance are skipped.
 */
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

/**
 * Metric for a function whose body spans the two braces. Only the line count and body hash are
 * measured; the line range is 0 and complexity 1 because regexes cannot know them.
 */
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

/**
 * Finds every class with balanced braces and measures it. Returns the source range of each class
 * too, so top-level function detection can skip code inside classes.
 */
function scanClassesWithRegex(text: string, limits: StructureLimits): RegexClassScan {
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
      longMethodCount: methods.filter((item) => isLongFunction(item, limits)).length,
      complexMethodCount: 0,
      maxMethodLineCount: classMaxMethodLineCount,
      maxMethodComplexity: 1,
    });

    CLASS_REGEX.lastIndex = closeBraceIndex + 1;
  }

  return scan;
}

/**
 * Finds `function` declarations and arrow functions assigned to a variable that are not inside one
 * of the class ranges. Returns their line counts and body hashes.
 */
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

/**
 * One synthetic `Class::*` entry per class that has a long method, because this fallback cannot
 * name the method; it carries the class's longest method length.
 */
function longClassMethodPlaceholders(
  classMetrics: SourceClassMetric[],
  limits: StructureLimits
): SourceFunctionMetric[] {
  return classMetrics
    .filter((classMetric) => classMetric.maxMethodLineCount >= limits.longMinLines)
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

/**
 * Structure metrics of a JS/TS file computed with regexes. Returns empty metrics for empty or
 * missing text and never reports complex methods.
 */
export function analyzeSourceFileStructureWithRegex(
  text: string | null,
  limits: StructureLimits = DEFAULT_STRUCTURE_LIMITS
): SourceFileMetrics {
  if (!text) {
    return emptyMetrics();
  }

  const classes = scanClassesWithRegex(text, limits);
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
      .filter((item) => isLongFunction(item, limits))
      .concat(longClassMethodPlaceholders(classes.metrics, limits)),
    complexMethods: [],
    allFunctions: topLevelFunctions,
  };
}
