/**
 * Measures a whole project headlessly: builds the graph, refreshes the documentation and clone
 * indexes and runs the pattern detectors once. `check` and `baseline` both start from this, so
 * the findings a baseline records are exactly the findings a check later compares with.
 */
import type { FindingSources } from '../analysis/baseline';
import { cloneIndex } from '../analysis/clones/CloneIndex';
import { documentationIndex } from '../analysis/documentation';
import { PatternDetectionAnalyzer } from '../analysis/PatternDetectionAnalyzer';
import type { PatternDetectionSources } from '../analysis/patternDetectionTypes';
import { buildHeadlessGraph } from './headlessGraph';

/** A measured project: the sources findings are read from, the detected patterns and the file count. */
export interface Measurement {
  sources: FindingSources;
  detection: PatternDetectionSources;
  fileCount: number;
}

/** Indexes the project at `root` and measures it; throws when it holds no indexable files. */
export const measureHeadless = async (root: string): Promise<Measurement> => {
  const { graph, fileCount } = await buildHeadlessGraph(root);
  const documentation = await documentationIndex.refreshFor(graph);
  await cloneIndex.refreshFor(graph);
  const detection = new PatternDetectionAnalyzer().analyzeWithSources(graph);
  return {
    sources: {
      graph,
      quality: detection.quality,
      architecture: detection.architecture,
      documentation,
    },
    detection,
    fileCount,
  };
};
