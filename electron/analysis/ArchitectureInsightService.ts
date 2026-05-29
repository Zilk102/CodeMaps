import { GraphData, GraphNode } from '../store';
import { buildGraphAdjacency } from './graphAnalysisUtils';
import { classifyNodeByRules, refineDirectoryClassifications } from './architectureClassification';
import { summarizeArchitectureDependencies } from './architectureDependencies';
import { DEFAULT_ARCHITECTURE_RULES, resolveArchitectureRules } from './architectureRules';
import {
  ALL_ARCHITECTURE_LAYERS,
  ArchitectureNodeClassification,
  ArchitectureOverview,
  ArchitectureRule,
} from './architectureTypes';

export type {
  ArchitectureLayer,
  ArchitectureLayerSummary,
  ArchitectureNodeClassification,
  ArchitectureOverview,
  ArchitectureRule,
  ArchitectureViolation,
  LayerDependencySummary,
} from './architectureTypes';

export { DEFAULT_ARCHITECTURE_RULES } from './architectureRules';

export class ArchitectureInsightService {
  private defaultRules: ArchitectureRule[];
  private cachedProjectRoot: string | null = null;
  private cachedCustomRules: ArchitectureRule[] | null = null;

  constructor(customRules?: ArchitectureRule[]) {
    this.defaultRules = customRules || DEFAULT_ARCHITECTURE_RULES;
  }

  getActiveRules(projectRoot: string): ArchitectureRule[] {
    if (this.cachedProjectRoot === projectRoot && this.cachedCustomRules) {
      return this.cachedCustomRules;
    }

    this.cachedProjectRoot = projectRoot;
    this.cachedCustomRules = resolveArchitectureRules(projectRoot, this.defaultRules);
    return this.cachedCustomRules;
  }

  analyze(graph: GraphData): ArchitectureOverview {
    const activeRules = this.getActiveRules(graph.projectRoot);
    const initialClassifications = graph.nodes.map((node) => this.classifyNode(node, activeRules));
    const { childrenByParentId } = buildGraphAdjacency(graph);
    const classifications = this.refineDirectoryClassifications(
      graph,
      initialClassifications,
      childrenByParentId
    );
    const layerByNodeId = new Map(classifications.map((record) => [record.nodeId, record.layer]));

    const layers = ALL_ARCHITECTURE_LAYERS.map((layer) => {
      const matching = classifications.filter((record) => record.layer === layer);
      return {
        layer,
        count: matching.length,
        sampleNodeIds: matching.slice(0, 5).map((record) => record.nodeId),
      };
    }).filter((summary) => summary.count > 0);

    const { dependencies, violations } = summarizeArchitectureDependencies(graph, layerByNodeId);

    const dominantLayer = layers.slice().sort((a, b) => b.count - a.count)[0]?.layer || 'unknown';

    return {
      classifications,
      layers,
      dependencies,
      violations,
      summary: {
        classifiedNodes: classifications.length,
        unknownNodes: classifications.filter((record) => record.layer === 'unknown').length,
        crossLayerDependencies: dependencies
          .filter((entry) => entry.sourceLayer !== entry.targetLayer)
          .reduce((sum, entry) => sum + entry.count, 0),
        violationCount: violations.length,
        dominantLayer,
      },
    };
  }

  classifyNode(node: GraphNode, activeRules: ArchitectureRule[]): ArchitectureNodeClassification {
    return classifyNodeByRules(node, activeRules);
  }

  private refineDirectoryClassifications(
    graph: GraphData,
    initialClassifications: ArchitectureNodeClassification[],
    childrenByParentId: Map<string, GraphNode[]>
  ) {
    return refineDirectoryClassifications(graph, initialClassifications, childrenByParentId);
  }
}
