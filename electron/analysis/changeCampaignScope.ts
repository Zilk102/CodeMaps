/**
 * Finds the files a change campaign covers: seed files, runtime composition roots and the files
 * reached through the dependency graph.
 */
import type { GraphData, GraphNode } from '../store/types';
import type { BlastRadiusAnalyzer } from './BlastRadiusAnalyzer';
import { isDiRuntimeLink } from './graphAnalysisUtils';
import { buildCollapsedAdjacency, toStructuralNodeId, unique } from './AgentContextUtils';
import { scoreCampaignNodeMatch } from './changeCampaignScoring';

/**
 * Per-seed view of a campaign's blast radius: the files each seed affects with a confidence level,
 * and the number of distinct affected files overall.
 */
export interface ChangeCampaignBlastRadiusView {
  seeds: Array<{
    nodeId: string;
    confidence: 'high' | 'medium' | 'low';
    affectedFiles: string[];
  }>;
  totalAffectedFiles: number;
}

/**
 * Resolves the seed targets to the files that contain them. If none of them is in a file, falls
 * back to file nodes matching the candidate queries. Returns at most `maxSeeds` files.
 */
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
    matchFilesByQuery(graph, candidateQueries, maxSeeds, fileNodes);
  }

  return Array.from(fileNodes.values()).slice(0, maxSeeds);
}

/**
 * Adds file nodes matching any candidate query to `fileNodes`, in graph order, until `maxSeeds`
 * files are collected.
 */
function matchFilesByQuery(
  graph: GraphData,
  candidateQueries: string[],
  maxSeeds: number,
  fileNodes: Map<string, GraphNode>
) {
  const files = graph.nodes.filter((node) => node.type === 'file');
  for (const node of files) {
    if (candidateQueries.some((query) => scoreCampaignNodeMatch(node, query) > 0)) {
      fileNodes.set(node.id, node);
    }
    if (fileNodes.size >= maxSeeds) break;
  }
}

/**
 * Finds files that wire runtime dependencies (DI links) and contain or reference the given files;
 * these composition roots must be checked when the campaign changes the files they set up.
 */
export function collectRuntimeCompositionRoots(graph: GraphData, files: GraphNode[]) {
  const fileIds = new Set(files.map((node) => node.id));
  const runtimeRoots = graph.links
    .filter((link) => isDiRuntimeLink(link) && fileIds.has(toStructuralNodeId(link.source)))
    .map((link) => graph.nodes.find((node) => node.id === toStructuralNodeId(link.source)))
    .filter((node): node is GraphNode => node !== undefined && node.type === 'file');

  return unique(runtimeRoots);
}

/**
 * Breadth-first expansion over file-level links in both directions, up to `depth` hops from the
 * given files and `maxFiles` files in total. The starting files come first in the result.
 */
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
    if (current.depth >= depth) continue;

    for (const neighbor of neighborsOf(collapsed, current.id)) {
      if (visited.has(neighbor)) continue;
      visited.add(neighbor);
      results.add(neighbor);
      queue.push({ id: neighbor, depth: current.depth + 1 });
      if (results.size >= maxFiles) break;
    }
  }

  return Array.from(results)
    .map((id) => graph.nodes.find((node) => node.id === id))
    .filter((node): node is GraphNode => Boolean(node))
    .slice(0, maxFiles);
}

/**
 * Runs the blast radius analyzer for each file and reduces the result to file ids (the file itself
 * plus dependents, truncated to `maxFiles` per seed), and counts the distinct files overall.
 */
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

function neighborsOf(
  collapsed: ReturnType<typeof buildCollapsedAdjacency>,
  fileId: string
): string[] {
  return [...(collapsed.outgoing.get(fileId) ?? []), ...(collapsed.incoming.get(fileId) ?? [])];
}

function buildCollapsedFileGraph(graph: GraphData) {
  const isFile = (id: string) => graph.nodes.find((node) => node.id === id)?.type === 'file';
  return buildCollapsedAdjacency(graph, (source, target) => isFile(source) && isFile(target));
}
