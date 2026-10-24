/**
 * Gathers every finding the baseline covers from the reports CodeMaps already computed, and gives
 * each its fingerprint. The same function feeds baseline creation, classification during
 * validation and the legacy-debt summary, so all three always agree.
 */
import type { GraphData } from '../../store/types';
import type { ArchitectureOverview } from '../architectureTypes';
import type { DocumentationReport } from '../documentation';
import type { ModuleQualitySummary } from '../moduleQualityMetrics';
import { loadProjectConfig } from '../projectConfig/configLoader';
import { isTestFile } from '../testFiles';
import { collectFanOutFindings, collectLayerFindings } from './architectureFindings';
import { collectCloneFindings } from './cloneFindings';
import { collectDocumentationFindings } from './documentationFindings';
import { fingerprintFindings } from './fingerprint';
import { collectStructureFindings } from './structureFindings';
import type { CurrentFinding } from './types';

/** The reports the findings are read from; all of them describe the same graph. */
export interface FindingSources {
  graph: GraphData;
  quality: ModuleQualitySummary;
  architecture: Pick<ArchitectureOverview, 'violations'>;
  /** Documentation coverage; null when it was not measured, which yields no documentation findings. */
  documentation: DocumentationReport | null;
}

/**
 * Every baselinable finding of the project: size and shape, clones, layer violations, fan-out and
 * documentation. Test files never count for size and shape, and files the project config excludes
 * count nowhere. Documentation is skipped when the config disables it.
 */
export const collectFindings = (sources: FindingSources): CurrentFinding[] => {
  const { graph, quality, architecture, documentation } = sources;
  const root = graph.projectRoot ?? '';
  const loaded = loadProjectConfig(root);
  const notExcluded = (path: string) => !loaded.isExcluded(path);
  const production = (path: string) => notExcluded(path) && !isTestFile(path);

  return fingerprintFindings(root, [
    ...collectStructureFindings(quality.metrics, production, quality.limits),
    ...collectCloneFindings(graph, quality.codeClones, production),
    ...collectLayerFindings(root, architecture.violations, notExcluded),
    ...collectFanOutFindings(graph, notExcluded),
    ...collectDocumentationFindings(
      loaded.config.documentation.enabled ? documentation : null,
      notExcluded
    ),
  ]);
};
