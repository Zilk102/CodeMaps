import type { GraphData } from '../store/types';
import { getHierarchyDepth, hasKnownParent } from './graphAnalysisUtils';
import type { ArchitectureOverview } from './ArchitectureInsightService';
import {
  computeFileCoupling,
  computeNodeFanIn,
  declaresWiring,
  isCompositionRoot,
  isSharedByDesign,
  WIRING_FAN_OUT_SCALE,
} from './couplingMetrics';
import type { DetectedPattern } from './patternDetectionTypes';
import { runBuilders } from './patternBuilderRunner';

type StructuralArgs = {
  graph: GraphData;
  architecture: ArchitectureOverview;
  incomingByTarget: Map<string, GraphData['links']>;
  outgoingBySource: Map<string, GraphData['links']>;
  nodeById: Map<string, GraphData['nodes'][number]>;
  childrenByParentId: Map<string, GraphData['nodes']>;
};

type StructuralBuilder = (args: StructuralArgs) => DetectedPattern | null;

function buildHubNodesPattern({ graph }: StructuralArgs): DetectedPattern | null {
  const nodeFanIn = computeNodeFanIn(graph);
  const highFanInNodes = graph.nodes
    .filter((node) => ['file', 'class', 'function'].includes(node.type))
    .filter((node) => !isSharedByDesign(node.id))
    .map((node) => ({ node, fanIn: nodeFanIn.get(node.id) ?? 0 }))
    .filter(({ fanIn }) => fanIn >= 8)
    .sort((a, b) => b.fanIn - a.fanIn)
    .slice(0, 10);

  if (highFanInNodes.length === 0) return null;
  return {
    id: 'hub_nodes',
    severity: highFanInNodes.some(({ fanIn }) => fanIn >= 15) ? 'high' : 'medium',
    title: 'Hub Nodes',
    description:
      'Nodes that many other files depend on can become bottlenecks and points of massive impact.',
    nodeIds: highFanInNodes.map(({ node }) => node.id),
  };
}

function buildHighFanOutPattern({
  graph,
  childrenByParentId,
}: StructuralArgs): DetectedPattern | null {
  const coupling = computeFileCoupling(graph);
  const highFanOutFiles = graph.nodes
    .filter((node) => node.type === 'file' && !isCompositionRoot(node.id))
    .map((node) => ({
      node,
      // A file that builds the object graph or the routes depends on much by design.
      scale: declaresWiring(childrenByParentId.get(node.id) ?? []) ? WIRING_FAN_OUT_SCALE : 1,
      fanOut: coupling.get(node.id)?.fanOut ?? 0,
    }))
    .filter(({ fanOut, scale }) => fanOut >= 12 * scale)
    .sort((a, b) => b.fanOut - a.fanOut)
    .slice(0, 10);

  if (highFanOutFiles.length === 0) return null;
  return {
    id: 'high_fan_out_files',
    severity: highFanOutFiles.some(({ fanOut, scale }) => fanOut >= 20 * scale) ? 'high' : 'medium',
    title: 'High Fan-Out Files',
    description:
      'Files that depend on many other files (siblings in the same folder count for little) are overloaded with responsibilities.',
    nodeIds: highFanOutFiles.map(({ node }) => node.id),
  };
}

function buildDeepNestingPattern({ graph, nodeById }: StructuralArgs): DetectedPattern | null {
  const deepNestedNodes = graph.nodes
    .filter((node) => node.type === 'file' || node.type === 'directory')
    .filter((node) => getHierarchyDepth(node, nodeById) >= 5)
    .slice(0, 20);

  if (deepNestedNodes.length === 0) return null;
  return {
    id: 'deep_nesting',
    severity: deepNestedNodes.length > 10 ? 'medium' : 'low',
    title: 'Deep Nesting',
    description: 'Excessively deep directory nesting complicates navigation and ownership.',
    nodeIds: deepNestedNodes.map((node) => node.id),
  };
}

function buildChurnHotspotsPattern({ graph }: StructuralArgs): DetectedPattern | null {
  const churnHotspots = graph.nodes
    .filter((node) => node.type === 'file' && node.churn >= 10)
    .sort((a, b) => b.churn - a.churn)
    .slice(0, 10);

  if (churnHotspots.length === 0) return null;
  return {
    id: 'churn_hotspots',
    severity: churnHotspots.some((node) => node.churn >= 25) ? 'high' : 'medium',
    title: 'Churn Hotspots',
    description: 'Files with high churn usually contain unstable or overloaded business logic.',
    nodeIds: churnHotspots.map((node) => node.id),
  };
}

function buildBroadAdrPattern({ graph }: StructuralArgs): DetectedPattern | null {
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

  if (overlyBroadAdr.length === 0) return null;
  return {
    id: 'broad_adr_impact',
    severity: 'low',
    title: 'Broad ADR Impact',
    description:
      'ADR is linked to a large number of files, consider checking granular ownership and traceability.',
    nodeIds: overlyBroadAdr,
  };
}

function buildIsolatedFilesPattern({
  graph,
  architecture,
  incomingByTarget,
  outgoingBySource,
  nodeById,
  childrenByParentId,
}: StructuralArgs): DetectedPattern | null {
  const layerByNodeId = new Map(
    architecture.classifications.map((record) => [record.nodeId, record.layer])
  );
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

  if (isolatedFiles.length < 3) return null;
  return {
    id: 'isolated_files',
    severity: isolatedFiles.length >= 8 ? 'medium' : 'low',
    title: 'Isolated Files',
    description:
      'Files are not involved in dependencies or hierarchical groups; check ignore lists, parsing, or actual project connectivity.',
    nodeIds: isolatedFiles.map((node) => node.id),
  };
}

function buildLayerViolationsPattern({ architecture }: StructuralArgs): DetectedPattern | null {
  if (architecture.violations.length === 0) return null;
  return {
    id: 'layer_violations',
    severity: architecture.violations.length > 10 ? 'high' : 'medium',
    title: 'Layer Violations',
    description:
      'Dependencies violating expected architectural boundaries between layers were detected.',
    nodeIds: architecture.violations
      .slice(0, 15)
      .flatMap((violation) => [violation.sourceId, violation.targetId]),
  };
}

function buildUnknownLayerPattern({ architecture }: StructuralArgs): DetectedPattern | null {
  const unknownLayerNodes = architecture.classifications
    .filter((record) => record.layer === 'unknown')
    .slice(0, 15);

  if (unknownLayerNodes.length < 5) return null;
  return {
    id: 'unknown_layer_classification',
    severity: 'low',
    title: 'Unknown Architecture Layer',
    description:
      'Some nodes do not fit into the architectural model, causing AI and tools to lose structural understanding of the system.',
    nodeIds: unknownLayerNodes.map((record) => record.nodeId),
  };
}

const STRUCTURAL_BUILDERS: StructuralBuilder[] = [
  buildHubNodesPattern,
  buildHighFanOutPattern,
  buildDeepNestingPattern,
  buildChurnHotspotsPattern,
  buildBroadAdrPattern,
  buildIsolatedFilesPattern,
  buildLayerViolationsPattern,
  buildUnknownLayerPattern,
];

export function buildStructuralPatterns(args: StructuralArgs): DetectedPattern[] {
  return runBuilders(STRUCTURAL_BUILDERS, args);
}
