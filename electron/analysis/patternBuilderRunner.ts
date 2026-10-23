import type { DetectedPattern } from './patternDetectionTypes';

export function runBuilders<T>(builders: Array<(input: T) => DetectedPattern | null>, input: T) {
  return builders
    .map((build) => build(input))
    .filter((pattern): pattern is DetectedPattern => pattern !== null);
}
