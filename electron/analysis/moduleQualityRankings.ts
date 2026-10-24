/**
 * Ranks the measured files of the module quality analysis per smell: oversized modules, god files,
 * god classes, long and complex methods and mixed responsibilities.
 */

import type { ModuleQualityMetric } from './moduleQualityTypes';

/** How many worst files each ranking keeps. */
export const TOP_LIMIT = 10;

/** Alphabetical tie-breaker by file label so equal rankings come out in a stable order. */
export const labelOrder = (left: ModuleQualityMetric, right: ModuleQualityMetric) =>
  left.node.label.localeCompare(right.node.label);

/**
 * Whether a module is oversized: 600+ lines or 25+ symbols. Files that could not be read and have
 * no symbols do not qualify.
 */
export const isOversizedModule = (metric: ModuleQualityMetric): boolean =>
  ((metric.lineCount || 0) >= 600 || metric.symbolCount >= 25) &&
  (metric.lineCount !== null || metric.symbolCount > 0);

/**
 * Top modules by size: 600+ lines or 25+ symbols qualify, largest first. Files that could not be
 * read and have no symbols are skipped.
 */
export const findOversizedModules = (metrics: ModuleQualityMetric[]) =>
  metrics
    .filter(isOversizedModule)
    .sort(
      (left, right) =>
        (right.lineCount || right.symbolCount * 20) - (left.lineCount || left.symbolCount * 20) ||
        right.symbolCount - left.symbolCount
    )
    .slice(0, TOP_LIMIT);

const isHugeModule = (metric: ModuleQualityMetric): boolean =>
  (metric.lineCount !== null && metric.lineCount >= 1500) || metric.symbolCount >= 45;

const isLargeModule = (metric: ModuleQualityMetric): boolean =>
  (metric.lineCount || 0) >= 900 || metric.symbolCount >= 30;

/**
 * Whether a large module also shows a second sign of being a god file: high coupling, many runtime
 * links, frequent changes, a god class or mixed responsibilities.
 */
const hasGodFileSignals = (metric: ModuleQualityMetric): boolean => {
  const stackDegree = metric.stackAwareDegree + metric.diRuntimeDegree + metric.contractDegree;
  return (
    metric.fanIn + metric.fanOut >= 12 ||
    stackDegree >= 6 ||
    metric.node.churn >= 10 ||
    metric.sourceMetrics.godClasses.length > 0 ||
    metric.mixedResponsibilities
  );
};

/** Whether a module is a god file: huge, or large with a second sign such as coupling or churn. */
export const isGodFile = (metric: ModuleQualityMetric): boolean =>
  isHugeModule(metric) || (isLargeModule(metric) && hasGodFileSignals(metric));

const godFileWeight = (metric: ModuleQualityMetric) =>
  (metric.lineCount || 0) +
  metric.symbolCount * 20 +
  (metric.fanIn + metric.fanOut) * 10 +
  metric.responsibilityAxisCount * 15;

/** The top god files, heaviest first by size, symbols, coupling and responsibility axes. */
export const findGodFiles = (metrics: ModuleQualityMetric[]) =>
  metrics
    .filter(isGodFile)
    .sort((left, right) => godFileWeight(right) - godFileWeight(left) || labelOrder(left, right))
    .slice(0, TOP_LIMIT);

/** Modules that have at least one matching item, worst first by the best score among them. */
export const rankByWorstMatch = <Item>(
  metrics: ModuleQualityMetric[],
  pick: (metric: ModuleQualityMetric) => Item[],
  score: (item: Item) => number
) => {
  const worst = (items: Item[]) => Math.max(...items.map(score));
  return metrics
    .filter((metric) => pick(metric).length > 0)
    .map((metric) => ({ metric, matched: pick(metric) }))
    .sort(
      (left, right) =>
        worst(right.matched) - worst(left.matched) || labelOrder(left.metric, right.metric)
    )
    .slice(0, TOP_LIMIT);
};

/**
 * Modules flagged as mixing responsibilities, with the most responsibility axes first, then the
 * longest.
 */
export const findMixedResponsibilityModules = (metrics: ModuleQualityMetric[]) =>
  metrics
    .filter((metric) => metric.mixedResponsibilities)
    .sort(
      (left, right) =>
        right.responsibilityAxisCount - left.responsibilityAxisCount ||
        (right.lineCount || 0) - (left.lineCount || 0) ||
        labelOrder(left, right)
    )
    .slice(0, TOP_LIMIT);
