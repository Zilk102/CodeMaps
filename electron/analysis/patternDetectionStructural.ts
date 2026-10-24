/**
 * Detects structural patterns in the graph: hubs, high fan-out, deep nesting, churn, broad ADRs,
 * isolated files and layer problems.
 */

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
import { buildPattern, highWhenAny, runBuilders, type PatternSpec } from './patternBuilderRunner';

type StructuralArgs = {
  graph: GraphData;
  architecture: ArchitectureOverview;
  incomingByTarget: Map<string, GraphData['links']>;
  outgoingBySource: Map<string, GraphData['links']>;
  nodeById: Map<string, GraphData['nodes'][number]>;
  childrenByParentId: Map<string, GraphData['nodes']>;
};

type StructuralBuilder = (args: StructuralArgs) => DetectedPattern | null;
type GraphNode = GraphData['nodes'][number];

/** The items that qualify, highest metric first, at most `limit` of them. */
const topBy = <T>(
  items: T[],
  qualifies: (item: T) => boolean,
  metric: (item: T) => number,
  limit = 10
): T[] =>
  items
    .filter(qualifies)
    .sort((a, b) => metric(b) - metric(a))
    .slice(0, limit);

const idsOfNodes = (nodes: GraphNode[]) => nodes.map((node) => node.id);

const HUB_NODES: PatternSpec<{ node: GraphNode; fanIn: number }> = {
  id: 'hub_nodes',
  title: 'Hub Nodes',
  description:
    'Nodes that many other files depend on can become bottlenecks and points of massive impact.',
  severity: highWhenAny(({ fanIn }) => fanIn >= 15),
  nodeIds: (hubs) => hubs.map(({ node }) => node.id),
};

/**
 * Finds up to 10 files, classes or functions with a fan-in of 8 or more, excluding
 * shared-by-design modules such as utils and types. High severity from a fan-in of 15.
 */
function buildHubNodesPattern({ graph }: StructuralArgs): DetectedPattern | null {
  const nodeFanIn = computeNodeFanIn(graph);
  const withFanIn = (node: GraphNode) => ({ node, fanIn: nodeFanIn.get(node.id) ?? 0 });
  const highFanInNodes = topBy(
    graph.nodes
      .filter((node) => ['file', 'class', 'function'].includes(node.type))
      .filter((node) => !isSharedByDesign(node.id))
      .map(withFanIn),
    ({ fanIn }) => fanIn >= 8,
    ({ fanIn }) => fanIn
  );
  return buildPattern(highFanInNodes, HUB_NODES);
}

interface FanOutFile {
  node: GraphNode;
  /** How many times the usual fan-out the file may have before it is a finding. */
  scale: number;
  fanOut: number;
}

const isExtremeFanOut = ({ fanOut, scale }: FanOutFile) => fanOut >= 20 * scale;

const HIGH_FAN_OUT: PatternSpec<FanOutFile> = {
  id: 'high_fan_out_files',
  title: 'High Fan-Out Files',
  description:
    'Files that depend on many other files (siblings in the same folder count for little) are overloaded with responsibilities.',
  severity: highWhenAny(isExtremeFanOut),
  nodeIds: (files) => files.map(({ node }) => node.id),
};

/**
 * Finds files that depend on 12 or more other files (siblings in the same folder count for less).
 * Composition roots are ignored and files that wire things together get a higher limit; 20 or more
 * (scaled the same way) makes it high severity.
 */
function buildHighFanOutPattern({
  graph,
  childrenByParentId,
}: StructuralArgs): DetectedPattern | null {
  const coupling = computeFileCoupling(graph);
  // A file that builds the object graph or the routes depends on much by design.
  const wiringScale = (node: GraphNode) =>
    declaresWiring(childrenByParentId.get(node.id) ?? []) ? WIRING_FAN_OUT_SCALE : 1;
  const highFanOutFiles = topBy(
    graph.nodes
      .filter((node) => node.type === 'file' && !isCompositionRoot(node.id))
      .map((node) => ({
        node,
        scale: wiringScale(node),
        fanOut: coupling.get(node.id)?.fanOut ?? 0,
      })),
    ({ fanOut, scale }) => fanOut >= 12 * scale,
    ({ fanOut }) => fanOut
  );
  return buildPattern(highFanOutFiles, HIGH_FAN_OUT);
}

const DEEP_NESTING: PatternSpec<GraphNode> = {
  id: 'deep_nesting',
  title: 'Deep Nesting',
  description: 'Excessively deep directory nesting complicates navigation and ownership.',
  severity: (nodes) => (nodes.length > 10 ? 'medium' : 'low'),
  nodeIds: idsOfNodes,
};

function buildDeepNestingPattern({ graph, nodeById }: StructuralArgs): DetectedPattern | null {
  const deepNestedNodes = graph.nodes
    .filter((node) => node.type === 'file' || node.type === 'directory')
    .filter((node) => getHierarchyDepth(node, nodeById) >= 5)
    .slice(0, 20);
  return buildPattern(deepNestedNodes, DEEP_NESTING);
}

const CHURN_HOTSPOTS: PatternSpec<GraphNode> = {
  id: 'churn_hotspots',
  title: 'Churn Hotspots',
  description: 'Files with high churn usually contain unstable or overloaded business logic.',
  severity: highWhenAny((node) => node.churn >= 25),
  nodeIds: idsOfNodes,
};

function buildChurnHotspotsPattern({ graph }: StructuralArgs): DetectedPattern | null {
  const churnHotspots = topBy(
    graph.nodes,
    (node) => node.type === 'file' && node.churn >= 10,
    (node) => node.churn
  );
  return buildPattern(churnHotspots, CHURN_HOTSPOTS);
}

const BROAD_ADR: PatternSpec<string> = {
  id: 'broad_adr_impact',
  title: 'Broad ADR Impact',
  description:
    'ADR is linked to a large number of files, consider checking granular ownership and traceability.',
  severity: () => 'low',
  nodeIds: (adrIds) => adrIds,
};

/**
 * Finds ADR documents linked from 12 or more files, which usually means the decision is too broad
 * to trace.
 */
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
  return buildPattern(overlyBroadAdr, BROAD_ADR);
}

const ISOLATED_FILES: PatternSpec<GraphNode> = {
  id: 'isolated_files',
  title: 'Isolated Files',
  description:
    'Files are not involved in dependencies or hierarchical groups; check ignore lists, parsing, or actual project connectivity.',
  severity: (files) => (files.length >= 8 ? 'medium' : 'low'),
  nodeIds: idsOfNodes,
};

/**
 * Finds up to 10 files without any links and without a known parent or children. Configuration
 * files are ignored, and the pattern is reported only when at least 3 such files exist.
 */
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
  return buildPattern(isolatedFiles, ISOLATED_FILES, 3);
}

type Violation = ArchitectureOverview['violations'][number];

const LAYER_VIOLATIONS: PatternSpec<Violation> = {
  id: 'layer_violations',
  title: 'Layer Violations',
  description:
    'Dependencies violating expected architectural boundaries between layers were detected.',
  severity: (violations) => (violations.length > 10 ? 'high' : 'medium'),
  nodeIds: (violations) =>
    violations.slice(0, 15).flatMap((violation) => [violation.sourceId, violation.targetId]),
};

function buildLayerViolationsPattern({ architecture }: StructuralArgs): DetectedPattern | null {
  return buildPattern(architecture.violations, LAYER_VIOLATIONS);
}

const UNKNOWN_LAYER: PatternSpec<ArchitectureOverview['classifications'][number]> = {
  id: 'unknown_layer_classification',
  title: 'Unknown Architecture Layer',
  description:
    'Some nodes do not fit into the architectural model, causing AI and tools to lose structural understanding of the system.',
  severity: () => 'low',
  nodeIds: (records) => records.map((record) => record.nodeId),
};

function buildUnknownLayerPattern({ architecture }: StructuralArgs): DetectedPattern | null {
  const unknownLayerNodes = architecture.classifications
    .filter((record) => record.layer === 'unknown')
    .slice(0, 15);
  return buildPattern(unknownLayerNodes, UNKNOWN_LAYER, 5);
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

/**
 * Runs all structural detectors on the graph and architecture data and returns the patterns found.
 */
export function buildStructuralPatterns(args: StructuralArgs): DetectedPattern[] {
  return runBuilders(STRUCTURAL_BUILDERS, args);
}
