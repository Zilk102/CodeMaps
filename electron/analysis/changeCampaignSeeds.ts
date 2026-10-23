import type { GraphData, GraphNode } from '../store/types';
import type { ArchitectureOverview } from './ArchitectureInsightService';
import { getCampaignNodeTypePriority, scoreCampaignNodeMatch } from './changeCampaignScoring';

const CAMPAIGN_NODE_TYPES = ['file', 'class', 'function'];
const FALLBACK_SEED_LAYERS = ['application', 'integration', 'analysis'];

/** Nodes the request names explicitly, keyed by id. */
function collectExactSeeds(
  graph: GraphData,
  seedNodeIds: string[],
  seedNodes: Map<string, GraphNode>
) {
  for (const seedNodeId of seedNodeIds) {
    const exact = graph.nodes.find((node) => node.id === seedNodeId);
    if (exact) {
      seedNodes.set(exact.id, exact);
    }
  }
}

/** Best-scoring file/class/function nodes for the candidate queries. */
function rankQueryMatches(graph: GraphData, candidateQueries: string[], limit: number) {
  return graph.nodes
    .filter((node) => CAMPAIGN_NODE_TYPES.includes(node.type))
    .map((node) => ({
      node,
      score: candidateQueries.reduce(
        (max, query) => Math.max(max, scoreCampaignNodeMatch(node, query)),
        0
      ),
    }))
    .filter(({ score }) => score > 0)
    .sort(
      (a, b) =>
        b.score - a.score ||
        getCampaignNodeTypePriority(b.node.type) - getCampaignNodeTypePriority(a.node.type) ||
        a.node.label.localeCompare(b.node.label)
    )
    .slice(0, limit);
}

/** If no explicit matches were found, top orchestrators from likely impacted layers. */
function fallbackOrchestrators(
  graph: GraphData,
  architecture: ArchitectureOverview,
  limit: number
) {
  return architecture.classifications
    .filter((record) => FALLBACK_SEED_LAYERS.includes(record.layer))
    .slice(0, limit)
    .map((record) => graph.nodes.find((node) => node.id === record.nodeId))
    .filter((node): node is GraphNode => Boolean(node));
}

export function resolveCampaignSeedTargets(
  graph: GraphData,
  input: { seedNodeIds?: string[]; candidateQueries: string[] },
  architecture: ArchitectureOverview,
  maxSeeds: number
) {
  const seedNodes = new Map<string, GraphNode>();
  collectExactSeeds(graph, input.seedNodeIds || [], seedNodes);

  for (const { node } of rankQueryMatches(graph, input.candidateQueries, maxSeeds * 3)) {
    seedNodes.set(node.id, node);
    if (seedNodes.size >= maxSeeds) {
      break;
    }
  }

  if (seedNodes.size === 0) {
    for (const node of fallbackOrchestrators(graph, architecture, maxSeeds)) {
      seedNodes.set(node.id, node);
    }
  }

  return Array.from(seedNodes.values()).slice(0, maxSeeds);
}
