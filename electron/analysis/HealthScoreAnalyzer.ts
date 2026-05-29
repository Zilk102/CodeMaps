import { GraphData } from '../store';
import {
  buildGraphAdjacency,
  hasKnownParent,
  isContractSemanticLink,
  isDiRuntimeLink,
  isStackAwareLink,
  shouldHaveDirectoryParent,
} from './graphAnalysisUtils';
import { ArchitectureInsightService } from './ArchitectureInsightService';
import { analyzeModuleQuality } from './moduleQualityMetrics';
import {
  buildHealthScoreResult,
  calculateMaintainabilityScore,
  calculateSolidScore,
} from './healthScorePolicies';
import type { HealthScoreMetricSnapshot, HealthScoreResult } from './healthScoreTypes';
export type { HealthScoreIssue, HealthScoreResult, HealthScoreSummary } from './healthScoreTypes';

export class HealthScoreAnalyzer {
  constructor(private readonly architectureInsightService = new ArchitectureInsightService()) {}

  analyze(graph: GraphData): HealthScoreResult {
    const architecture = this.architectureInsightService.analyze(graph);
    const layerByNodeId = new Map(
      architecture.classifications.map((record) => [record.nodeId, record.layer])
    );
    const { nodeById, incomingByTarget, outgoingBySource, childrenByParentId } =
      buildGraphAdjacency(graph);
    const quality = analyzeModuleQuality(graph);
    const fileNodes = graph.nodes.filter((node) => node.type === 'file');
    const symbolNodes = graph.nodes.filter((node) => node.id.includes('#'));
    const orphanNodes = graph.nodes.filter((node) => {
      if (layerByNodeId.get(node.id) === 'configuration') {
        return false;
      }

      const hasIncoming = (incomingByTarget.get(node.id) || []).length > 0;
      const hasOutgoing = (outgoingBySource.get(node.id) || []).length > 0;
      const hasKnownHierarchyParent = hasKnownParent(node, nodeById);
      const hasHierarchyChildren = (childrenByParentId.get(node.id) || []).length > 0;
      const structuralNode = node.type === 'directory' || node.type === 'project';
      return (
        !structuralNode &&
        !hasIncoming &&
        !hasOutgoing &&
        !hasKnownHierarchyParent &&
        !hasHierarchyChildren
      );
    });

    const unresolvedImportLinks = graph.links.filter((link) => {
      if (link.type !== 'import') return false;
      return !nodeById.has(link.target);
    }).length;
    const stackAwareLinks = graph.links.filter((link) => isStackAwareLink(link)).length;
    const diRuntimeLinks = graph.links.filter((link) => isDiRuntimeLink(link)).length;
    const contractSemanticLinks = graph.links.filter((link) => isContractSemanticLink(link)).length;
    const oversizedModules = quality.oversizedModules.length;
    const godFiles = quality.godFiles.length;
    const godClasses = quality.godClasses.reduce(
      (count, metric) => count + metric.matchedClasses.length,
      0
    );
    const longMethods = quality.longMethods.reduce(
      (count, metric) => count + metric.matchedMethods.length,
      0
    );
    const complexMethods = quality.complexMethods.reduce(
      (count, metric) => count + metric.matchedMethods.length,
      0
    );
    const mixedResponsibilityModules = quality.mixedResponsibilityModules.length;
    const avgDesignSmellScore =
      quality.metrics.length === 0
        ? 0
        : quality.metrics.reduce((sum, metric) => sum + metric.designSmellScore, 0) /
          quality.metrics.length;
    const maintainabilityScore = calculateMaintainabilityScore({
      avgDesignSmellScore,
      longMethods,
      complexMethods,
      oversizedModules,
      godFiles,
      fileNodes: fileNodes.length,
    });
    const solidScore = calculateSolidScore({
      godFiles,
      godClasses,
      mixedResponsibilityModules,
      architectureViolations: architecture.summary.violationCount,
      avgDesignSmellScore,
    });
    const refreshTelemetry = graph.refreshTelemetry;
    const refreshTrends = refreshTelemetry?.trends;

    const directoryChildren = graph.nodes.filter((node) => {
      if (!shouldHaveDirectoryParent(node, graph.projectRoot)) {
        return false;
      }
      if (node.type !== 'file' && node.type !== 'adr') {
        return false;
      }
      if (!node.parentId) return false;
      const parent = nodeById.get(node.parentId);
      return parent?.type === 'directory';
    }).length;

    const nodesThatShouldHaveDirectoryParent = graph.nodes.filter((node) =>
      shouldHaveDirectoryParent(node, graph.projectRoot)
    ).length;

    const directoryCoverageRatio =
      nodesThatShouldHaveDirectoryParent === 0
        ? 1
        : directoryChildren / nodesThatShouldHaveDirectoryParent;

    const metrics: HealthScoreMetricSnapshot = {
      totalNodes: graph.nodes.length,
      totalLinks: graph.links.length,
      fileNodes: fileNodes.length,
      symbolNodes: symbolNodes.length,
      orphanNodes: orphanNodes.length,
      unresolvedImportLinks,
      directoryCoverageRatio,
      architectureViolations: architecture.summary.violationCount,
      unknownLayerNodes: architecture.summary.unknownNodes,
      stackAwareLinks,
      diRuntimeLinks,
      contractSemanticLinks,
      oversizedModules,
      godFiles,
      godClasses,
      longMethods,
      complexMethods,
      mixedResponsibilityModules,
      avgDesignSmellScore,
      maintainabilityScore,
      solidScore,
      watcherFlushes: refreshTelemetry?.watcher.flushCount || 0,
      watcherBatchedEvents: refreshTelemetry?.watcher.batchedEventCount || 0,
      watcherCoalescedFlushes: refreshTelemetry?.watcher.coalescedFlushes || 0,
      skippedRefreshes: refreshTelemetry?.enrichment.skippedRefreshes || 0,
      runtimePriorityRebuilds: refreshTelemetry?.enrichment.runtimePriorityRebuilds || 0,
      avgRefreshLatencyMs: refreshTelemetry?.enrichment.avgRefreshLatencyMs || 0,
      refreshSkipRate: refreshTrends?.enrichment.skipRate || 0,
      runtimePriorityRate: refreshTrends?.enrichment.runtimePriorityRate || 0,
      refreshLatencyTrend: refreshTrends?.enrichment.latencyTrend || 'stable',
      refreshPipelineDegraded: refreshTrends?.enrichment.degraded || false,
    };

    return buildHealthScoreResult(metrics);
  }
}
