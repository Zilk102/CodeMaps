import * as crypto from 'crypto';
import type { SourceClassMetric, SourceFileMetrics, SourceFunctionMetric } from './structureTypes';

export const SUPPORTED_SOURCE_FILE_REGEX = /\.(?:[cm]?[jt]sx?)$/iu;

export const LONG_METHOD_LINES = 70;

export function hashBody(body: string): string {
  return crypto.createHash('md5').update(body.replace(/\s+/g, '')).digest('hex');
}

export function maxOf(
  items: SourceFunctionMetric[],
  pick: (item: SourceFunctionMetric) => number
): number {
  return items.reduce((max, item) => Math.max(max, pick(item)), 0);
}

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

export function isGodClassByComplexity(classMetric: SourceClassMetric): boolean {
  return classMetric.maxMethodComplexity >= 12 || classMetric.complexMethodCount >= 2;
}

export function isComplexFunction(item: SourceFunctionMetric): boolean {
  return item.complexity >= 10 || item.maxNesting >= 4;
}
