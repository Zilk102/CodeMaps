/**
 * Finds copy-pasted code for the module quality analysis: the token-level detector's groups when it
 * has run, otherwise functions with an identical body.
 */

import { cloneIndex } from './clones/CloneIndex';
import type { ModuleQualityMetric, ModuleQualitySummary } from './moduleQualityTypes';

const MAX_FUNCTION_CLONES = 15;
const MIN_CLONE_FUNCTION_LINES = 8;

/** The clone groups of a module quality summary, shared by both clone sources. */
export type CloneGroups = ModuleQualitySummary['codeClones'];

/** Functions with an identical body: the fallback before the token-level detector has run. */
export const findFunctionClones = (metrics: ModuleQualityMetric[]): CloneGroups => {
  const instancesByHash = new Map<
    string,
    Array<{ nodeId: string; methodName: string; lineCount: number }>
  >();
  for (const metric of metrics) {
    for (const func of metric.sourceMetrics.allFunctions) {
      if (func.lineCount < MIN_CLONE_FUNCTION_LINES || !func.bodyHash) continue;
      const bucket = instancesByHash.get(func.bodyHash) || [];
      bucket.push({ nodeId: metric.node.id, methodName: func.name, lineCount: func.lineCount });
      instancesByHash.set(func.bodyHash, bucket);
    }
  }
  return Array.from(instancesByHash.entries())
    .filter(([, instances]) => instances.length >= 2)
    .map(([bodyHash, instances]) => ({ bodyHash, instances }))
    .sort(
      (a, b) =>
        b.instances[0].lineCount * b.instances.length -
        a.instances[0].lineCount * a.instances.length
    )
    .slice(0, MAX_FUNCTION_CLONES);
};

/** Copy-paste across any language, found by the token-level detector once it has run. */
export const findStructuralClones = (projectRoot: string | undefined): CloneGroups | null =>
  cloneIndex.peek(projectRoot)?.map((group) => ({
    bodyHash: `${group.tokenCount}:${group.instances[0].file}:${group.instances[0].startLine}`,
    instances: group.instances.map((instance) => ({
      nodeId: instance.file,
      methodName: `${instance.file.split('/').pop()}:${instance.startLine}-${instance.endLine}`,
      lineCount: group.lineCount,
    })),
  })) ?? null;
