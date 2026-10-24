/**
 * Measures the structural health of a project graph (hierarchy, links, architecture, code quality,
 * refresh pipeline) and scores it.
 */

import { GraphData } from '../store/types';
import { buildGraphAdjacency } from './graphAnalysisUtils';
import { documentationIndex, type DocumentationIndex } from './documentation';
import { ArchitectureInsightService } from './ArchitectureInsightService';
import { analyzeModuleQuality } from './moduleQualityMetrics';
import { buildHealthScoreResult } from './healthScorePolicies';
import {
  buildLinkMetrics,
  buildRefreshMetrics,
  calculateDirectoryCoverageRatio,
  isOrphanNode,
} from './healthScoreGraphMetrics';
import {
  buildArchitectureMetrics,
  buildDocumentationMetrics,
  summarizeQuality,
} from './healthScoreQualityMetrics';
import { withProjectSettings } from './healthScoreProjectSettings';
import type { HealthScoreMetricSnapshot, HealthScoreResult } from './healthScoreTypes';
export type { HealthScoreIssue, HealthScoreResult, HealthScoreSummary } from './healthScoreTypes';

/** Computes the health score of a graph with the architecture and module quality analyzers. */
export class HealthScoreAnalyzer {
  constructor(
    private readonly architectureInsightService = new ArchitectureInsightService(),
    private readonly documentation: Pick<DocumentationIndex, 'peek'> = documentationIndex
  ) {}

  /**
   * Gathers all metrics of the graph and passes them to the scoring policy. The result has a 0-100
   * score, a grade, the metric summary and the issues found.
   */
  analyze(graph: GraphData): HealthScoreResult {
    const architecture = this.architectureInsightService.analyze(graph);
    const layerByNodeId = new Map<string, string>(
      architecture.classifications.map((record) => [record.nodeId, record.layer])
    );
    const adjacency = buildGraphAdjacency(graph);
    const quality = analyzeModuleQuality(graph);
    const counts = summarizeQuality(quality);
    const fileCount = graph.nodes.filter((node) => node.type === 'file').length;
    const symbolCount = graph.nodes.filter((node) => node.id.includes('#')).length;
    const orphanCount = graph.nodes.filter((node) =>
      isOrphanNode(node, layerByNodeId, adjacency)
    ).length;

    const documentationMetrics = buildDocumentationMetrics(this.documentation, graph.projectRoot);

    const metrics: HealthScoreMetricSnapshot = {
      totalNodes: graph.nodes.length,
      totalLinks: graph.links.length,
      fileNodes: fileCount,
      symbolNodes: symbolCount,
      orphanNodes: orphanCount,
      ...buildLinkMetrics(graph, adjacency.nodeById),
      directoryCoverageRatio: calculateDirectoryCoverageRatio(graph, adjacency.nodeById),
      ...buildArchitectureMetrics(
        architecture,
        counts,
        fileCount,
        documentationMetrics.documentationCoveragePercent
      ),
      ...counts,
      ...documentationMetrics,
      ...buildRefreshMetrics(graph),
    };

    return withProjectSettings(buildHealthScoreResult(metrics), {
      graph,
      quality,
      architecture,
      documentation: this.documentation.peek(graph.projectRoot),
    });
  }
}
