import { GraphData } from '../store';
import {
  buildGraphAdjacency,
  hasKnownParent,
  shouldHaveDirectoryParent,
} from './graphAnalysisUtils';
import { ArchitectureInsightService } from './ArchitectureInsightService';

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
