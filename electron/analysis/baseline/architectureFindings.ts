/**
 * Baseline findings about dependencies: layer violations (one per file pair) and files with a very
 * high fan-out. Both are about how files relate, so the finding belongs to the importing file.
 */
import type { GraphData } from '../../store/types';
import type { ArchitectureViolation } from '../architectureTypes';
import { buildGraphAdjacency } from '../graphAnalysisUtils';
import { findHighFanOutFiles, isExtremeFanOut } from '../patternDetectionStructural';
import { relativeToRoot } from '../projectConfig/projectPaths';
import type { FindingDraft } from './types';

/** The file part of a node id (`file#symbol` becomes `file`). */
export const fileOfNodeId = (nodeId: string): string => nodeId.split('#')[0];

/**
 * One draft per layer violation, keyed by the importing file and the imported file. A repeated
 * dependency between the same two files is a single finding.
 */
export const collectLayerFindings = (
  root: string,
  violations: ArchitectureViolation[],
  include: (path: string) => boolean
): FindingDraft[] => {
  const seen = new Set<string>();
  const drafts: FindingDraft[] = [];
  for (const violation of violations) {
    const source = fileOfNodeId(violation.sourceId);
    const target = fileOfNodeId(violation.targetId);
    const key = `${source}->${target}`;
    if (seen.has(key) || !include(source)) continue;
    seen.add(key);
    drafts.push({
      kind: 'layer_violation',
      path: source,
      relatedPath: target,
      symbol: relativeToRoot(root, target),
      line: 0,
      measure: 0,
      severity: 'medium',
      message: `${relativeToRoot(root, source)} (${violation.sourceLayer}) -> ${relativeToRoot(root, target)} (${violation.targetLayer}): ${violation.reason}`,
    });
  }
  return drafts;
};

/** One draft per file whose fan-out is above the limit; the measure is the fan-out. */
export const collectFanOutFindings = (
  graph: GraphData,
  include: (path: string) => boolean
): FindingDraft[] =>
  findHighFanOutFiles(graph, buildGraphAdjacency(graph).childrenByParentId, Infinity)
    .filter((file) => include(file.node.id))
    .map((file) => ({
      kind: 'high_fan_out' as const,
      path: file.node.id,
      symbol: '',
      line: 0,
      measure: Math.round(file.fanOut),
      severity: isExtremeFanOut(file) ? ('high' as const) : ('medium' as const),
      message: `${file.node.label}: depends on ${Math.round(file.fanOut)} files.`,
    }));
