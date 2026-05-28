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

export interface HealthScoreIssue {
  code: string;
  severity: 'high' | 'medium' | 'low';
  message: string;
}

export interface HealthScoreResult {
  score: number;
  grade: 'A' | 'B' | 'C' | 'D' | 'F';
  summary: {
    totalNodes: number;
    totalLinks: number;
    fileNodes: number;
    symbolNodes: number;
    orphanNodes: number;
    unresolvedImportLinks: number;
    directoryCoverageRatio: number;
    architectureViolations: number;
    unknownLayerNodes: number;
    stackAwareLinks: number;
    diRuntimeLinks: number;
    contractSemanticLinks: number;
    oversizedModules: number;
    godFiles: number;
    godClasses: number;
    longMethods: number;
    complexMethods: number;
    mixedResponsibilityModules: number;
    avgDesignSmellScore: number;
    maintainabilityScore: number;
    solidScore: number;
    watcherFlushes: number;
    watcherBatchedEvents: number;
    watcherCoalescedFlushes: number;
    skippedRefreshes: number;
    runtimePriorityRebuilds: number;
    avgRefreshLatencyMs: number;
    refreshSkipRate: number;
    runtimePriorityRate: number;
    refreshLatencyTrend: 'stable' | 'improving' | 'degrading';
    refreshPipelineDegraded: boolean;
  };
  issues: HealthScoreIssue[];
}

export class HealthScoreAnalyzer {
  analyze(graph: GraphData): HealthScoreResult {
    const architecture = new ArchitectureInsightService().analyze(graph);
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
    const maintainabilityScore = Math.max(
      0,
      Math.min(
        100,
        100 -
          avgDesignSmellScore * 0.55 -
          longMethods * 2 -
          complexMethods * 2 -
          oversizedModules * 4 -
          godFiles * 6
      )
    );
    const solidScore = Math.max(
      0,
      Math.min(
        100,
        100 -
          godFiles * 10 -
          godClasses * 8 -
          mixedResponsibilityModules * 8 -
          architecture.summary.violationCount * 4 -
          avgDesignSmellScore * 0.25
      )
    );
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

    const issues: HealthScoreIssue[] = [];
    let score = 100;

    if (graph.nodes.length === 0) {
      issues.push({
        code: 'empty_graph',
        severity: 'high',
        message: 'Граф пуст, индексация проекта не дала ни одного узла.',
      });
      score -= 70;
    }

    if (unresolvedImportLinks > 0) {
      issues.push({
        code: 'unresolved_import_links',
        severity: unresolvedImportLinks > 25 ? 'high' : 'medium',
        message: `Обнаружено ${unresolvedImportLinks} import-связей с неразрешенной целью.`,
      });
      score -= Math.min(25, unresolvedImportLinks);
    }

    if (orphanNodes.length > 0) {
      issues.push({
        code: 'orphan_nodes',
        severity: orphanNodes.length > 20 ? 'medium' : 'low',
        message: `Обнаружено ${orphanNodes.length} изолированных узлов без входящих и исходящих связей.`,
      });
      score -= Math.min(15, Math.ceil(orphanNodes.length / 3));
    }

    if (directoryCoverageRatio < 0.85) {
      issues.push({
        code: 'weak_hierarchy',
        severity: directoryCoverageRatio < 0.5 ? 'high' : 'medium',
        message: `Иерархия неполная: только ${(directoryCoverageRatio * 100).toFixed(1)}% файлов и ADR узлов имеют директорию-родителя.`,
      });
      score -= Math.min(20, Math.ceil((1 - directoryCoverageRatio) * 20));
    }

    if (symbolNodes.length === 0 && fileNodes.length > 0) {
      issues.push({
        code: 'missing_symbols',
        severity: 'high',
        message: 'Файлы найдены, но symbol-level узлы отсутствуют: парсинг сущностей деградировал.',
      });
      score -= 25;
    }

    if (architecture.summary.violationCount > 0) {
      issues.push({
        code: 'architecture_violations',
        severity: architecture.summary.violationCount > 10 ? 'high' : 'medium',
        message: `Обнаружено ${architecture.summary.violationCount} нарушений межслоевых зависимостей.`,
      });
      score -= Math.min(20, architecture.summary.violationCount * 2);
    }

    if (architecture.summary.unknownNodes > 0) {
      issues.push({
        code: 'unknown_layer_nodes',
        severity: architecture.summary.unknownNodes > 25 ? 'medium' : 'low',
        message: `Для ${architecture.summary.unknownNodes} узлов не удалось определить архитектурный слой.`,
      });
      score -= Math.min(10, Math.ceil(architecture.summary.unknownNodes / 10));
    }

    if (oversizedModules > 0) {
      issues.push({
        code: 'oversized_modules',
        severity: oversizedModules >= 3 ? 'high' : 'medium',
        message: `Обнаружено ${oversizedModules} oversized-модулей с избыточным размером или плотностью символов.`,
      });
      score -= Math.min(15, oversizedModules * 3);
    }

    if (godFiles > 0) {
      issues.push({
        code: 'god_files',
        severity: 'high',
        message: `Обнаружено ${godFiles} god-file модулей с чрезмерной концентрацией ответственности.`,
      });
      score -= Math.min(20, godFiles * 5);
    }

    if (godClasses > 0) {
      issues.push({
        code: 'god_classes',
        severity: godClasses >= 3 ? 'high' : 'medium',
        message: `Обнаружено ${godClasses} god-class конструкций с перегруженным публичным API или слишком большим телом класса.`,
      });
      score -= Math.min(18, godClasses * 4);
    }

    if (longMethods > 0) {
      issues.push({
        code: 'long_methods',
        severity: longMethods >= 4 ? 'high' : 'medium',
        message: `Обнаружено ${longMethods} длинных методов/функций, ухудшающих читаемость и стоимость безопасного рефакторинга.`,
      });
      score -= Math.min(12, Math.ceil(longMethods * 2));
    }

    if (complexMethods > 0) {
      issues.push({
        code: 'complex_methods',
        severity: complexMethods >= 4 ? 'high' : 'medium',
        message: `Обнаружено ${complexMethods} методов/функций с высокой цикломатической сложностью или глубокой вложенностью.`,
      });
      score -= Math.min(14, Math.ceil(complexMethods * 2));
    }

    if (mixedResponsibilityModules > 0) {
      issues.push({
        code: 'mixed_responsibility_modules',
        severity: mixedResponsibilityModules >= 3 ? 'high' : 'medium',
        message: `Обнаружено ${mixedResponsibilityModules} модулей со смешанными архитектурными ответственностями.`,
      });
      score -= Math.min(16, mixedResponsibilityModules * 4);
    }

    if (maintainabilityScore < 85) {
      issues.push({
        code: 'maintainability_score',
        severity: maintainabilityScore < 60 ? 'high' : 'medium',
        message: `Maintainability score снижен до ${maintainabilityScore.toFixed(1)}: стоимость поддержки и безопасного рефакторинга уже заметно выросла.`,
      });
      score -= Math.min(12, Math.ceil((85 - maintainabilityScore) / 8));
    }

    if (solidScore < 85) {
      issues.push({
        code: 'solid_score',
        severity: solidScore < 60 ? 'high' : 'medium',
        message: `SOLID score снижен до ${solidScore.toFixed(1)}: наблюдаются признаки нарушения SRP/размывания границ ответственности.`,
      });
      score -= Math.min(12, Math.ceil((85 - solidScore) / 8));
    }

    if (refreshTrends?.enrichment.degraded) {
      issues.push({
        code: 'refresh_pipeline_degradation',
        severity:
          (refreshTelemetry?.enrichment.avgRefreshLatencyMs || 0) >= 50 ||
          refreshTrends.enrichment.skipRate >= 0.5
            ? 'high'
            : 'medium',
        message: `Incremental refresh деградирует: latency trend=${refreshTrends.enrichment.latencyTrend}, skip rate=${(refreshTrends.enrichment.skipRate * 100).toFixed(1)}%, avg latency=${(refreshTelemetry?.enrichment.avgRefreshLatencyMs || 0).toFixed(1)} ms.`,
      });
      score -= Math.min(
        12,
        Math.ceil((refreshTelemetry?.enrichment.avgRefreshLatencyMs || 0) / 15) +
          Math.ceil(refreshTrends.enrichment.skipRate * 10)
      );
    }

    score = Math.max(0, Math.min(100, score));

    return {
      score,
      grade: this.toGrade(score),
      summary: {
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
      },
      issues,
    };
  }

  private toGrade(score: number): 'A' | 'B' | 'C' | 'D' | 'F' {
    if (score >= 90) return 'A';
    if (score >= 80) return 'B';
    if (score >= 70) return 'C';
    if (score >= 60) return 'D';
    return 'F';
  }
}
