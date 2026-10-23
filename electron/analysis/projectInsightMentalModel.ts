import { GraphData, GraphLink, GraphNode } from '../store/types';
import type { ArchitectureLayer, ArchitectureOverview } from './ArchitectureInsightService';
import { buildGraphAdjacency, isContractSemanticLink, isDiRuntimeLink } from './graphAnalysisUtils';
import type { ProjectInsightResult } from './ProjectInsightService';

const FILE_LIMIT = 8;

type GraphAdjacency = ReturnType<typeof buildGraphAdjacency>;

interface MentalModelContext {
  fileNodes: GraphNode[];
  layerByNodeId: Map<string, ArchitectureLayer>;
  incomingByTarget: GraphAdjacency['incomingByTarget'];
  outgoingBySource: GraphAdjacency['outgoingBySource'];
}

const ORCHESTRATOR_LAYERS: string[] = ['application', 'analysis', 'integration'];
const FOUNDATION_LAYERS: string[] = ['shared', 'state'];

function rankEntryPoints(context: MentalModelContext) {
  const { fileNodes, layerByNodeId, incomingByTarget, outgoingBySource } = context;
  return collectRankedFiles(fileNodes, (node) => {
    const fanIn = incomingByTarget.get(node.id)?.length || 0;
    if (!isEntryPointCandidate(node, layerByNodeId.get(node.id), fanIn)) {
      return null;
    }

    return scoreEntryPoint(
      node,
      layerByNodeId.get(node.id),
      fanIn,
      outgoingBySource.get(node.id)?.length || 0
    );
  });
}

function rankCoreOrchestrators(context: MentalModelContext) {
  const { fileNodes, layerByNodeId, incomingByTarget, outgoingBySource } = context;
  return collectRankedFiles(fileNodes, (node) => {
    if (!ORCHESTRATOR_LAYERS.includes(layerByNodeId.get(node.id) || '')) {
      return null;
    }

    const fanOut = outgoingBySource.get(node.id)?.length || 0;
    const fanIn = incomingByTarget.get(node.id)?.length || 0;
    return fanOut > 0 || fanIn > 0 ? fanOut + fanIn : null;
  });
}

function rankByOutgoingLinks(context: MentalModelContext, matches: (link: GraphLink) => boolean) {
  const { fileNodes, outgoingBySource } = context;
  return collectRankedFiles(
    fileNodes,
    (node) => (outgoingBySource.get(node.id) || []).filter(matches).length
  );
}

function rankSharedFoundations(context: MentalModelContext) {
  const { fileNodes, layerByNodeId, incomingByTarget } = context;
  return collectRankedFiles(fileNodes, (node) => {
    if (!FOUNDATION_LAYERS.includes(layerByNodeId.get(node.id) || '')) {
      return null;
    }

    return incomingByTarget.get(node.id)?.length || 0;
  });
}

function describeKeyBoundaries(architecture: ArchitectureOverview) {
  return architecture.dependencies
    .filter((entry) => entry.sourceLayer !== entry.targetLayer)
    .slice(0, 6)
    .map((entry) => `${entry.sourceLayer} -> ${entry.targetLayer} (${entry.count})`);
}

export function buildProjectMentalModel(
  graph: GraphData,
  architecture: ArchitectureOverview
): ProjectInsightResult['mentalModel'] {
  const { incomingByTarget, outgoingBySource } = buildGraphAdjacency(graph);
  const context: MentalModelContext = {
    fileNodes: graph.nodes.filter((node) => node.type === 'file'),
    layerByNodeId: new Map(
      architecture.classifications.map((record) => [record.nodeId, record.layer])
    ),
    incomingByTarget,
    outgoingBySource,
  };

  return {
    entryPoints: rankEntryPoints(context),
    coreOrchestrators: rankCoreOrchestrators(context),
    runtimeCompositionRoots: rankByOutgoingLinks(context, (link) => isDiRuntimeLink(link)),
    contractSurfaces: rankByOutgoingLinks(context, (link) => isContractSemanticLink(link)),
    sharedFoundations: rankSharedFoundations(context),
    keyBoundaries: describeKeyBoundaries(architecture),
    likelyWorkflows: buildLikelyWorkflows(architecture, graph),
  };
}

function collectRankedFiles(fileNodes: GraphNode[], scoreNode: (node: GraphNode) => number | null) {
  return fileNodes
    .map((node) => ({ node, score: scoreNode(node) }))
    .filter((entry): entry is { node: GraphNode; score: number } =>
      Boolean(entry.score && entry.score > 0)
    )
    .sort((a, b) => b.score - a.score || a.node.label.localeCompare(b.node.label))
    .slice(0, FILE_LIMIT)
    .map(({ node }) => node);
}

function isEntryPointCandidate(
  node: GraphNode,
  layer: ArchitectureLayer | undefined,
  fanIn: number
) {
  if (layer === 'configuration') {
    return false;
  }

  const normalizedId = node.id.toLowerCase();
  const explicitEntrypoint =
    /(?:^|\/)(main|app|server|cli|index|preload|worker|mcp|oracle)\.(?:ts|tsx|js|jsx)$/u.test(
      normalizedId
    );
  if (explicitEntrypoint) {
    return true;
  }

  return Boolean(layer === 'integration' && fanIn === 0);
}

function scoreEntryPoint(
  node: GraphNode,
  layer: ArchitectureLayer | undefined,
  fanIn: number,
  fanOut: number
) {
  const normalizedId = node.id.toLowerCase();
  let score = fanOut * 3 - fanIn;

  if (layer === 'integration') score += 20;
  if (layer === 'application') score += 16;
  if (layer === 'presentation') score += 12;
  if (
    /(?:^|\/)(main|app|server|cli|index|preload|worker|mcp|oracle)\.(?:ts|tsx|js|jsx)$/u.test(
      normalizedId
    )
  ) {
    score += 25;
  }

  return score;
}

const LAYER_WORKFLOWS: Array<{ from: ArchitectureLayer; to: ArchitectureLayer; text: string }> = [
  {
    from: 'presentation',
    to: 'state',
    text: 'UI -> state: User actions pass through presentation and are stored in the state layer.',
  },
  {
    from: 'integration',
    to: 'application',
    text: 'Integration -> application: Input adapters and MCP/entrypoints coordinate backend orchestration.',
  },
  {
    from: 'application',
    to: 'parsing',
    text: 'Application -> parsing: Orchestration layer triggers language parsing and project indexing.',
  },
  {
    from: 'analysis',
    to: 'state',
    text: 'Analysis -> state: Analytics services rely on the normalized graph and store representation.',
  },
];

function buildLikelyWorkflows(architecture: ArchitectureOverview, graph: GraphData) {
  const layers = new Set(architecture.layers.map((entry) => entry.layer));
  const workflows: string[] = LAYER_WORKFLOWS.filter(
    ({ from, to }) => layers.has(from) && layers.has(to)
  ).map(({ text }) => text);

  if (graph.links.some((link) => isDiRuntimeLink(link))) {
    workflows.push(
      'Runtime DI contracts: Composition roots wire providers/services to concrete implementations beyond plain import dependencies.'
    );
  }
  if (graph.links.some((link) => isContractSemanticLink(link))) {
    workflows.push(
      'API contract -> generated/runtime: OpenAPI and protobuf schemas bind to generated clients, handlers, and servers beyond plain import edges.'
    );
  }
  if (workflows.length === 0) {
    workflows.push(
      'Explicit system workflows are partially recognized; consider expanding the entry points and runtime flow model.'
    );
  }

  return workflows;
}
