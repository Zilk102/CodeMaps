import { GraphData } from '../store';
import {
  buildGraphAdjacency,
  getHierarchyDepth,
  hasKnownParent,
  isContractSemanticLink,
  isDiRuntimeLink,
  isStackAwareLink,
} from './graphAnalysisUtils';
import { ArchitectureInsightService } from './ArchitectureInsightService';
import { analyzeModuleQuality, SourceClassMetric, SourceFunctionMetric } from './moduleQualityMetrics';

export interface PatternEvidence {
  nodeId: string;
  message: string;
}

export interface DetectedPattern {
  id: string;
  severity: 'high' | 'medium' | 'low';
  title: string;
  description: string;
  nodeIds: string[];
  evidence?: PatternEvidence[];
}

export interface PatternDetectionResult {
  patterns: DetectedPattern[];
}

export class PatternDetectionAnalyzer {
  analyze(graph: GraphData): PatternDetectionResult {
    const architecture = new ArchitectureInsightService().analyze(graph);
    const layerByNodeId = new Map(
      architecture.classifications.map((record) => [record.nodeId, record.layer])
    );
    const quality = analyzeModuleQuality(graph);
    const { nodeById, incomingByTarget, outgoingBySource, childrenByParentId } =
      buildGraphAdjacency(graph);
    const patterns: DetectedPattern[] = [];

    const highFanInNodes = graph.nodes
      .filter((node) => ['file', 'class', 'function'].includes(node.type))
      .map((node) => ({ node, fanIn: (incomingByTarget.get(node.id) || []).length }))
      .filter(({ fanIn }) => fanIn >= 8)
      .sort((a, b) => b.fanIn - a.fanIn)
      .slice(0, 10);

    if (highFanInNodes.length > 0) {
      patterns.push({
        id: 'hub_nodes',
        severity: highFanInNodes.some(({ fanIn }) => fanIn >= 15) ? 'high' : 'medium',
        title: 'Hub Nodes',
        description:
          'Nodes with excessively high fan-in can become bottlenecks and points of massive impact.',
        nodeIds: highFanInNodes.map(({ node }) => node.id),
      });
    }

    const highFanOutFiles = graph.nodes
      .filter((node) => node.type === 'file')
      .map((node) => ({ node, fanOut: (outgoingBySource.get(node.id) || []).length }))
      .filter(({ fanOut }) => fanOut >= 12)
      .sort((a, b) => b.fanOut - a.fanOut)
      .slice(0, 10);

    if (highFanOutFiles.length > 0) {
      patterns.push({
        id: 'high_fan_out_files',
        severity: highFanOutFiles.some(({ fanOut }) => fanOut >= 20) ? 'high' : 'medium',
        title: 'High Fan-Out Files',
        description:
          'Files with a large number of outgoing dependencies are overloaded with responsibilities.',
        nodeIds: highFanOutFiles.map(({ node }) => node.id),
      });
    }

    const deepNestedNodes = graph.nodes
      .filter((node) => node.type === 'file' || node.type === 'directory')
      .filter((node) => getHierarchyDepth(node, nodeById) >= 5)
      .slice(0, 20);

    if (deepNestedNodes.length > 0) {
      patterns.push({
        id: 'deep_nesting',
        severity: deepNestedNodes.length > 10 ? 'medium' : 'low',
        title: 'Deep Nesting',
        description: 'Excessively deep directory nesting complicates navigation and ownership.',
        nodeIds: deepNestedNodes.map((node) => node.id),
      });
    }

    const churnHotspots = graph.nodes
      .filter((node) => node.type === 'file' && node.churn >= 10)
      .sort((a, b) => b.churn - a.churn)
      .slice(0, 10);

    if (churnHotspots.length > 0) {
      patterns.push({
        id: 'churn_hotspots',
        severity: churnHotspots.some((node) => node.churn >= 25) ? 'high' : 'medium',
        title: 'Churn Hotspots',
        description:
          'Files with high churn usually contain unstable or overloaded business logic.',
        nodeIds: churnHotspots.map((node) => node.id),
      });
    }

    if (quality.oversizedModules.length > 0) {
      patterns.push({
        id: 'oversized_modules',
        severity: quality.oversizedModules.some(
          ({ lineCount, symbolCount }) => (lineCount || 0) >= 1200 || symbolCount >= 40
        )
          ? 'high'
          : 'medium',
        title: 'Oversized Modules',
        description:
          'Some files are too large or too symbol-dense, making responsibilities unclear and architectural evolution harder.',
        nodeIds: quality.oversizedModules.map(({ node }) => node.id),
        evidence: quality.oversizedModules.slice(0, 5).map(({ node, lineCount, symbolCount }) => ({
          nodeId: node.id,
          message: `${node.label}: ${lineCount || 0} LOC, ${symbolCount} symbols.`,
        })),
      });
    }

    if (quality.godFiles.length > 0) {
      patterns.push({
        id: 'god_files',
        severity: 'high',
        title: 'God Files',
        description:
          'A few modules accumulate too much code, too many symbols, or too many architectural responsibilities, violating SRP and making safe changes harder.',
        nodeIds: quality.godFiles.map(({ node }) => node.id),
        evidence: quality.godFiles.slice(0, 5).map(
          ({ node, responsibilityAxisCount, designSmellScore, sourceMetrics }) => ({
            nodeId: node.id,
            message: `${node.label}: smell score ${designSmellScore}, axes ${responsibilityAxisCount}, god classes ${sourceMetrics.godClasses.length}.`,
          })
        ),
      });
    }

    if (quality.godClasses.length > 0) {
      patterns.push({
        id: 'god_classes',
        severity: quality.godClasses.some(({ matchedClasses }) =>
          matchedClasses.some((item) => item.lineCount >= 400 || item.methodCount >= 16)
        )
          ? 'high'
          : 'medium',
        title: 'God Classes',
        description:
          'Some classes expose too many methods or span too many lines, suggesting broken encapsulation and SRP violations.',
        nodeIds: quality.godClasses.map(({ node }) => node.id),
        evidence: quality.godClasses.flatMap(({ node, matchedClasses }) =>
          matchedClasses.slice(0, 2).map((item) => ({
            nodeId: node.id,
            message: this.describeClassEvidence(node.label, item),
          }))
        ).slice(0, 8),
      });
    }

    if (quality.longMethods.length > 0) {
      patterns.push({
        id: 'long_methods',
        severity: quality.longMethods.some(({ matchedMethods }) =>
          matchedMethods.some((item) => item.lineCount >= 120)
        )
          ? 'high'
          : 'medium',
        title: 'Long Methods',
        description:
          'Some files contain methods or functions that are too long, making intent harder to follow and safe refactoring more expensive.',
        nodeIds: quality.longMethods.map(({ node }) => node.id),
        evidence: quality.longMethods.flatMap(({ node, matchedMethods }) =>
          matchedMethods.slice(0, 2).map((item) => ({
            nodeId: node.id,
            message: this.describeMethodEvidence(node.label, item),
          }))
        ).slice(0, 8),
      });
    }

    if (quality.complexMethods.length > 0) {
      patterns.push({
        id: 'complex_methods',
        severity: quality.complexMethods.some(({ matchedMethods }) =>
          matchedMethods.some((item) => item.complexity >= 15 || item.maxNesting >= 5)
        )
          ? 'high'
          : 'medium',
        title: 'Complex Methods',
        description:
          'Some methods contain too many branches or too much nesting, so behavior is harder to reason about and refactor safely.',
        nodeIds: quality.complexMethods.map(({ node }) => node.id),
        evidence: quality.complexMethods.flatMap(({ node, matchedMethods }) =>
          matchedMethods.slice(0, 2).map((item) => ({
            nodeId: node.id,
            message: this.describeMethodEvidence(node.label, item),
          }))
        ).slice(0, 8),
      });
    }

    if (quality.mixedResponsibilityModules.length > 0) {
      patterns.push({
        id: 'mixed_responsibility_modules',
        severity: quality.mixedResponsibilityModules.some(
          ({ responsibilityAxisCount, lineCount }) =>
            responsibilityAxisCount >= 6 || (lineCount || 0) >= 800
        )
          ? 'high'
          : 'medium',
        title: 'Mixed Responsibility Modules',
        description:
          'Some modules mix orchestration, runtime wiring, contracts, and helper logic in one place, making clean layering and future extraction harder.',
        nodeIds: quality.mixedResponsibilityModules.map(({ node }) => node.id),
        evidence: quality.mixedResponsibilityModules.slice(0, 5).map(
          ({ node, responsibilityAxisCount, designSmellScore, sourceMetrics }) => ({
            nodeId: node.id,
            message: `${node.label}: smell score ${designSmellScore}, axes ${responsibilityAxisCount}, long methods ${sourceMetrics.longMethods.length}, complex methods ${sourceMetrics.complexMethods.length}.`,
          })
        ),
      });
    }

    const adrLinkedFiles = new Map<string, Set<string>>();
    graph.links
      .filter((link) => link.type === 'adr')
      .forEach((link) => {
        const bucket = adrLinkedFiles.get(link.target) || new Set<string>();
        bucket.add(link.source);
        adrLinkedFiles.set(link.target, bucket);
      });

    const overlyBroadAdr = Array.from(adrLinkedFiles.entries())
      .filter(([, fileIds]) => fileIds.size >= 12)
      .map(([adrId]) => adrId);

    if (overlyBroadAdr.length > 0) {
      patterns.push({
        id: 'broad_adr_impact',
        severity: 'low',
        title: 'Broad ADR Impact',
        description:
          'ADR is linked to a large number of files, consider checking granular ownership and traceability.',
        nodeIds: overlyBroadAdr,
      });
    }

    const isolatedFiles = graph.nodes
      .filter((node) => node.type === 'file')
      .filter((node) => {
        if (layerByNodeId.get(node.id) === 'configuration') {
          return false;
        }

        const fanIn = (incomingByTarget.get(node.id) || []).length;
        const fanOut = (outgoingBySource.get(node.id) || []).length;
        const hasKnownHierarchy =
          hasKnownParent(node, nodeById) || (childrenByParentId.get(node.id) || []).length > 0;
        return fanIn === 0 && fanOut === 0 && !hasKnownHierarchy;
      })
      .slice(0, 10);

    if (isolatedFiles.length >= 3) {
      patterns.push({
        id: 'isolated_files',
        severity: isolatedFiles.length >= 8 ? 'medium' : 'low',
        title: 'Isolated Files',
        description:
          'Files are not involved in dependencies or hierarchical groups; check ignore lists, parsing, or actual project connectivity.',
        nodeIds: isolatedFiles.map((node) => node.id),
      });
    }

    if (architecture.violations.length > 0) {
      patterns.push({
        id: 'layer_violations',
        severity: architecture.violations.length > 10 ? 'high' : 'medium',
        title: 'Layer Violations',
        description:
          'Dependencies violating expected architectural boundaries between layers were detected.',
        nodeIds: architecture.violations
          .slice(0, 15)
          .flatMap((violation) => [violation.sourceId, violation.targetId]),
      });
    }

    const stackAwareHubs = graph.nodes
      .filter((node) => node.type === 'file')
      .map((node) => {
        const relatedLinks = [
          ...(incomingByTarget.get(node.id) || []),
          ...(outgoingBySource.get(node.id) || []),
        ].filter((link) => isStackAwareLink(link));
        return { node, degree: relatedLinks.length };
      })
      .filter(({ degree }) => degree >= 4)
      .sort((a, b) => b.degree - a.degree)
      .slice(0, 10);

    if (stackAwareHubs.length > 0) {
      patterns.push({
        id: 'stack_orchestration_hubs',
        severity: stackAwareHubs.some(({ degree }) => degree >= 8) ? 'high' : 'medium',
        title: 'Stack Orchestration Hubs',
        description:
          'Framework/build orchestration is concentrated in a few files, increasing coupling between runtime entrypoints and stack infrastructure.',
        nodeIds: stackAwareHubs.map(({ node }) => node.id),
      });
    }

    const diRuntimeHubs = graph.nodes
      .filter((node) => node.type === 'file')
      .map((node) => {
        const relatedLinks = [
          ...(incomingByTarget.get(node.id) || []),
          ...(outgoingBySource.get(node.id) || []),
        ].filter((link) => isDiRuntimeLink(link));
        return { node, degree: relatedLinks.length };
      })
      .filter(({ degree }) => degree >= 2)
      .sort((a, b) => b.degree - a.degree)
      .slice(0, 10);

    if (diRuntimeHubs.length > 0) {
      patterns.push({
        id: 'di_runtime_contract_hubs',
        severity: diRuntimeHubs.some(({ degree }) => degree >= 5) ? 'high' : 'medium',
        title: 'DI Runtime Contract Hubs',
        description:
          'Runtime contracts are concentrated in a few composition roots, so provider bindings and service registrations deserve explicit architectural review.',
        nodeIds: diRuntimeHubs.map(({ node }) => node.id),
      });
    }

    const contractRuntimeHubs = graph.nodes
      .filter((node) => node.type === 'file')
      .map((node) => {
        const relatedLinks = [
          ...(incomingByTarget.get(node.id) || []),
          ...(outgoingBySource.get(node.id) || []),
        ].filter((link) => isContractSemanticLink(link));
        return { node, degree: relatedLinks.length };
      })
      .filter(({ degree }) => degree >= 2)
      .sort((a, b) => b.degree - a.degree)
      .slice(0, 10);

    if (contractRuntimeHubs.length > 0) {
      patterns.push({
        id: 'contract_runtime_binding_hubs',
        severity: contractRuntimeHubs.some(({ degree }) => degree >= 5) ? 'high' : 'medium',
        title: 'Contract Runtime Binding Hubs',
        description:
          'API contracts, generated artifacts, and runtime handlers/clients converge in a few files, so schema changes may propagate wider than import-based coupling suggests.',
        nodeIds: contractRuntimeHubs.map(({ node }) => node.id),
      });
    }

    const unknownLayerNodes = architecture.classifications
      .filter((record) => record.layer === 'unknown')
      .slice(0, 15);

    if (unknownLayerNodes.length >= 5) {
      patterns.push({
        id: 'unknown_layer_classification',
        severity: 'low',
        title: 'Unknown Architecture Layer',
        description:
          'Some nodes do not fit into the architectural model, causing AI and tools to lose structural understanding of the system.',
        nodeIds: unknownLayerNodes.map((record) => record.nodeId),
      });
    }

    return { patterns };
  }

  private describeClassEvidence(fileName: string, item: SourceClassMetric): string {
    const range =
      item.startLine > 0 && item.endLine >= item.startLine
        ? `L${item.startLine}-L${item.endLine}`
        : 'line range unavailable';
    return `${fileName} -> class ${item.name} (${range}): ${item.lineCount} LOC, ${item.methodCount} methods, ${item.publicMethodCount} public, max complexity ${item.maxMethodComplexity}.`;
  }

  private describeMethodEvidence(fileName: string, item: SourceFunctionMetric): string {
    const range =
      item.startLine > 0 && item.endLine >= item.startLine
        ? `L${item.startLine}-L${item.endLine}`
        : 'line range unavailable';
    return `${fileName} -> ${item.name} (${range}): ${item.lineCount} LOC, complexity ${item.complexity}, branches ${item.branchCount}, max nesting ${item.maxNesting}.`;
  }
}
