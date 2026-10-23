import type { GraphData, GraphNode } from '../store/types';
import type { BlastRadiusAnalyzer } from './BlastRadiusAnalyzer';
import { isDiRuntimeLink } from './graphAnalysisUtils';
import { toStructuralNodeId, unique } from './AgentContextUtils';
import { scoreCampaignNodeMatch } from './changeCampaignScoring';

export interface ChangeCampaignBlastRadiusView {
  seeds: Array<{
    nodeId: string;
    confidence: 'high' | 'medium' | 'low';
    affectedFiles: string[];
  }>;
  totalAffectedFiles: number;
}

export function collectMatchedFiles(
  graph: GraphData,
  seedTargets: GraphNode[],
  candidateQueries: string[],
  maxSeeds: number
) {
  const fileNodes = new Map<string, GraphNode>();

  for (const target of seedTargets) {
    const structuralId = toStructuralNodeId(target.id);
    const fileNode = graph.nodes.find((node) => node.id === structuralId && node.type === 'file');
    if (fileNode) {
      fileNodes.set(fileNode.id, fileNode);
    }
  }

  if (fileNodes.size === 0) {
    for (const node of graph.nodes) {
      if (node.type !== 'file') {
        continue;
      }
      const matched = candidateQueries.some((query) => scoreCampaignNodeMatch(node, query) > 0);
      if (matched) {
        fileNodes.set(node.id, node);
      }
      if (fileNodes.size >= maxSeeds) {
        break;
      }
    }
  }

  return Array.from(fileNodes.values()).slice(0, maxSeeds);
}

export function collectRuntimeCompositionRoots(graph: GraphData, files: GraphNode[]) {
  const fileIds = new Set(files.map((node) => node.id));
  const runtimeRoots = graph.links
    .filter((link) => isDiRuntimeLink(link) && fileIds.has(toStructuralNodeId(link.source)))
    .map((link) => graph.nodes.find((node) => node.id === toStructuralNodeId(link.source)))
    .filter((node): node is GraphNode => node !== undefined && node.type === 'file');

  return unique(runtimeRoots);
}

export function expandAffectedFiles(
  graph: GraphData,
  files: GraphNode[],
  depth: number,
  maxFiles: number
) {
  const collapsed = buildCollapsedFileGraph(graph);
  const queue = files.map((node) => ({ id: node.id, depth: 0 }));
  const visited = new Set(queue.map((entry) => entry.id));
  const results = new Set(queue.map((entry) => entry.id));

  while (queue.length > 0 && results.size < maxFiles) {
    const current = queue.shift()!;
    if (current.depth >= depth) {
      continue;
    }

    const neighbors = [
      ...(collapsed.outgoing.get(current.id) || []),
      ...(collapsed.incoming.get(current.id) || []),
    ];

    for (const neighbor of neighbors) {
      if (visited.has(neighbor)) {
        continue;
      }
      visited.add(neighbor);
      results.add(neighbor);
      queue.push({ id: neighbor, depth: current.depth + 1 });
      if (results.size >= maxFiles) {
        break;
      }
    }
  }

  return Array.from(results)
    .map((id) => graph.nodes.find((node) => node.id === id))
    .filter((node): node is GraphNode => Boolean(node))
    .slice(0, maxFiles);
}

export function buildChangeCampaignBlastRadius(
  graph: GraphData,
  files: GraphNode[],
  depth: number,
  maxFiles: number,
  blastRadiusAnalyzer: Pick<BlastRadiusAnalyzer, 'analyze'>
): ChangeCampaignBlastRadiusView {
  const seeds = files.map((file) => {
    const blast = blastRadiusAnalyzer.analyze(graph, file.id, depth);
    const affectedFiles = unique([
      file.id,
      ...blast.directDependents.map((node) => toStructuralNodeId(node.id)),
      ...blast.affectedNodes.map((node) => toStructuralNodeId(node.id)),
    ]).slice(0, maxFiles);

    return {
      nodeId: file.id,
      confidence: blast.confidence,
      affectedFiles,
    };
  });

  return {
    seeds,
    totalAffectedFiles: unique(seeds.flatMap((seed) => seed.affectedFiles)).length,
  };
}

function buildCollapsedFileGraph(graph: GraphData) {
  const outgoing = new Map<string, string[]>();
  const incoming = new Map<string, string[]>();

  for (const link of graph.links) {
    const source = toStructuralNodeId(link.source);
    const target = toStructuralNodeId(link.target);

    if (source === target) {
      continue;
    }

    const sourceNode = graph.nodes.find((node) => node.id === source);
    const targetNode = graph.nodes.find((node) => node.id === target);
    if (sourceNode?.type !== 'file' || targetNode?.type !== 'file') {
      continue;
    }

    outgoing.set(source, unique([...(outgoing.get(source) || []), target]));
    incoming.set(target, unique([...(incoming.get(target) || []), source]));
  }

  return { outgoing, incoming };
}
