import { GraphData, GraphNode } from '../store';
import type { ArchitectureLayer, ArchitectureOverview } from './ArchitectureInsightService';
import { buildGraphAdjacency, isContractSemanticLink, isDiRuntimeLink } from './graphAnalysisUtils';
import type { ProjectInsightResult } from './ProjectInsightService';

const FILE_LIMIT = 8;

export function buildProjectMentalModel(
  graph: GraphData,
  architecture: ArchitectureOverview
): ProjectInsightResult['mentalModel'] {
  const { incomingByTarget, outgoingBySource } = buildGraphAdjacency(graph);
  const layerByNodeId = new Map(
    architecture.classifications.map((record) => [record.nodeId, record.layer])
  );
  const fileNodes = graph.nodes.filter((node) => node.type === 'file');

  const entryPoints = collectRankedFiles(fileNodes, (node) => {
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

  const coreOrchestrators = collectRankedFiles(fileNodes, (node) => {
    if (!['application', 'analysis', 'integration'].includes(layerByNodeId.get(node.id) || '')) {
      return null;
    }

    const fanOut = outgoingBySource.get(node.id)?.length || 0;
    const fanIn = incomingByTarget.get(node.id)?.length || 0;
    return fanOut > 0 || fanIn > 0 ? fanOut + fanIn : null;
  });

  const runtimeCompositionRoots = collectRankedFiles(
    fileNodes,
    (node) => (outgoingBySource.get(node.id) || []).filter((link) => isDiRuntimeLink(link)).length
  );

  const contractSurfaces = collectRankedFiles(
    fileNodes,
    (node) =>
      (outgoingBySource.get(node.id) || []).filter((link) => isContractSemanticLink(link)).length
  );

  const sharedFoundations = collectRankedFiles(fileNodes, (node) => {
    if (!['shared', 'state'].includes(layerByNodeId.get(node.id) || '')) {
      return null;
    }

    return incomingByTarget.get(node.id)?.length || 0;
  });

  const keyBoundaries = architecture.dependencies
    .filter((entry) => entry.sourceLayer !== entry.targetLayer)
    .slice(0, 6)
    .map((entry) => `${entry.sourceLayer} -> ${entry.targetLayer} (${entry.count})`);

  return {
    entryPoints,
    coreOrchestrators,
    runtimeCompositionRoots,
    contractSurfaces,
    sharedFoundations,
    keyBoundaries,
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

function buildLikelyWorkflows(architecture: ArchitectureOverview, graph: GraphData) {
  const layers = new Set(architecture.layers.map((entry) => entry.layer));
  const workflows: string[] = [];

  if (layers.has('presentation') && layers.has('state')) {
    workflows.push(
      'UI -> state: User actions pass through presentation and are stored in the state layer.'
    );
  }
  if (layers.has('integration') && layers.has('application')) {
    workflows.push(
      'Integration -> application: Input adapters and MCP/entrypoints coordinate backend orchestration.'
    );
  }
  if (layers.has('application') && layers.has('parsing')) {
    workflows.push(
      'Application -> parsing: Orchestration layer triggers language parsing and project indexing.'
    );
  }
  if (layers.has('analysis') && layers.has('state')) {
    workflows.push(
      'Analysis -> state: Analytics services rely on the normalized graph and store representation.'
    );
  }
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
