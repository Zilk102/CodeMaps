import { GraphData } from '../store';
import { buildGraphAdjacency, getHierarchyDepth, hasKnownParent } from './graphAnalysisUtils';
import { ArchitectureInsightService } from './ArchitectureInsightService';

export interface DetectedPattern {
  id: string;
  severity: 'high' | 'medium' | 'low';
  title: string;
  description: string;
  nodeIds: string[];
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
}
