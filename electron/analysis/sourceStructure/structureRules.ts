// Thresholds and small helpers that decide what counts as a long method, a complex function or a god
// class.

import * as crypto from 'crypto';
import type { SourceClassMetric, SourceFileMetrics, SourceFunctionMetric } from './structureTypes';

export const SUPPORTED_SOURCE_FILE_REGEX = /\.(?:[cm]?[jt]sx?)$/iu;

export const LONG_METHOD_LINES = 70;

/**
 * MD5 of the body with all whitespace removed, so reformatted copies of a function hash the same.
 * Used only for comparison, not security.
 */
export function hashBody(body: string): string {
  return crypto.createHash('md5').update(body.replace(/\s+/g, '')).digest('hex');
}

/** Largest value `pick` returns over the items, or 0 for an empty list. */
export function maxOf(
  items: SourceFunctionMetric[],
  pick: (item: SourceFunctionMetric) => number
): number {
  return items.reduce((max, item) => Math.max(max, pick(item)), 0);
}

/** Metrics of a file with no classes or functions, also the result for unreadable files. */
export function emptyMetrics(): SourceFileMetrics {
  return {
    classCount: 0,
    topLevelFunctionCount: 0,
    publicMethodCount: 0,
    maxMethodLineCount: 0,
    godClasses: [],
    longMethods: [],
    complexMethods: [],
    allFunctions: [],
  };
}

/**
 * God-class test by size: 220+ lines, 10+ methods, 8+ public methods in 140+ lines, or 6+ public
 * methods in 120+ lines with a long method.
 */
export function isGodClassBySize(classMetric: SourceClassMetric): boolean {
  return (
    classMetric.lineCount >= 220 ||
    classMetric.methodCount >= 10 ||
    (classMetric.publicMethodCount >= 8 && classMetric.lineCount >= 140) ||
    (classMetric.publicMethodCount >= 6 &&
      classMetric.lineCount >= 120 &&
      classMetric.longMethodCount >= 1)
  );
}

/**
 * God-class test by complexity: a method with complexity 12 or more, or at least two complex
 * methods.
 */
export function isGodClassByComplexity(classMetric: SourceClassMetric): boolean {
  return classMetric.maxMethodComplexity >= 12 || classMetric.complexMethodCount >= 2;
}

/** A function is complex at cyclomatic complexity 10 or more, or nesting depth 4 or more. */
export function isComplexFunction(item: SourceFunctionMetric): boolean {
  return item.complexity >= 10 || item.maxNesting >= 4;
}
