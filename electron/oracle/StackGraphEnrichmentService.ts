/** Adds framework and build relationship links to the graph and decides when a file change makes them stale. */

import { StackInsightService } from '../analysis/StackInsightService';
import { StackTopologyService } from '../analysis/StackTopologyService';
import { GraphData, GraphLink, oracleStore } from '../store';
import { GraphBuilder } from './GraphBuilder';
import { normalizePath } from './shared';

const STACK_ENRICHMENT_LINK_TYPES = ['framework', 'build'] as const;
const STACK_REFRESH_PATH_PATTERNS = [
  /(?:^|\/)package\.json$/i,
  /(?:^|\/)(pom\.xml|build\.gradle(?:\.kts)?|settings\.gradle(?:\.kts)?)$/i,
  /(?:^|\/)(vite|next)\.config\.(?:ts|js|mjs)$/i,
  /(?:^|\/)app\/.*\/?(?:page|layout|route)\.(?:tsx|ts|jsx|js)$/i,
  /(?:^|\/)pages\/(?:_app|_document)\.(?:tsx|ts|jsx|js)$/i,
  /(?:^|\/)main\.(?:ts|js)$/i,
  /(?:^|\/)[^/]+\.module\.(?:ts|js)$/i,
  /(?:^|\/)[^/]+\.controller\.(?:ts|js)$/i,
  /(?:^|\/)[^/]+\.service\.(?:ts|js)$/i,
  /(?:^|\/)Program\.cs$/i,
  /(?:^|\/)[^/]+Controller\.cs$/i,
  /(?:^|\/)[^/]+Service\.cs$/i,
  /(?:^|\/)([^/]+Application|[^/]+Controller|[^/]+Service|[^/]+Repository)\.(?:java|kt)$/i,
] as const;

/** File-system event kinds that can trigger an enrichment refresh. */
export type StackEnrichmentRefreshEvent = 'add' | 'change' | 'unlink' | 'addDir' | 'unlinkDir';

/** What a refresh did: whether it rebuilt or skipped, why, which paths triggered it and how many links it added. */
export interface StackEnrichmentRefreshResult {
  mode: 'skipped' | 'rebuilt';
  reason: 'no_stack_impact' | 'directory_structure_changed' | 'stack_runtime_path_changed';
  changedPaths: string[];
  linksAdded: number;
}

const linkKey = (link: GraphLink) =>
  `${link.source}->${link.target}:${link.type}:${link.reason || ''}`;

/** Keeps the first link of every source/target/type/reason combination. */
const dedupeLinks = (links: GraphLink[]) => {
  const seen = new Set<string>();
  return links.filter((link) => {
    const key = linkKey(link);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
};

/** Computes `framework` and `build` links from stack analysis and keeps them in the graph. */
export class StackGraphEnrichmentService {
  constructor(
    private readonly graphBuilder: GraphBuilder,
    private readonly stackInsightService = new StackInsightService(),
    private readonly stackTopologyService = new StackTopologyService()
  ) {}

  /** Re-analyzes the stack of `graph`, replaces all framework and build links with the fresh, de-duplicated ones, and returns the analysis with the number of links added. */
  async rebuild(graph: GraphData) {
    const stackProfile = await this.stackInsightService.analyze(graph);
    const stackTopology = await this.stackTopologyService.analyze(graph, stackProfile);
    const dedupedLinks = dedupeLinks(this.buildEnrichmentLinks(graph, stackTopology));

    this.graphBuilder.removeLinksByTypes([...STACK_ENRICHMENT_LINK_TYPES]);
    this.graphBuilder.applyEnrichmentLinks(dedupedLinks);

    return {
      stackProfile,
      stackTopology,
      linksAdded: dedupedLinks.length,
    };
  }

  /** Turns the relationships found by stack analysis into links between existing nodes. Relationships whose ends cannot be matched to a node, or that point to themselves, are dropped. */
  private buildEnrichmentLinks(
    graph: GraphData,
    stackTopology: Awaited<ReturnType<StackTopologyService['analyze']>>
  ): GraphLink[] {
    const nodeIds = new Set(graph.nodes.map((node) => node.id));
    const links: GraphLink[] = [];

    for (const insight of [...stackTopology.frameworkInsights, ...stackTopology.buildInsights]) {
      for (const relationship of insight.relationships) {
        const sourceId = this.resolveNodeId(relationship.source, graph.projectRoot, nodeIds);
        const targetId = this.resolveNodeId(
          relationship.target,
          graph.projectRoot,
          nodeIds,
          sourceId
        );
        if (!sourceId || !targetId || sourceId === targetId) continue;

        links.push({
          source: sourceId,
          target: targetId,
          value: 1,
          type: relationship.type,
          reason: relationship.reason,
        });
      }
    }

    return links;
  }

  /** Refreshes the links after a file change: rebuilds only if `changedPaths` could affect the stack (see `shouldRefreshForChangedPaths`), otherwise skips. Records the outcome and duration in refresh telemetry. */
  async rebuildForChangedPaths(
    graph: GraphData,
    changedPaths: string[],
    event: StackEnrichmentRefreshEvent
  ): Promise<StackEnrichmentRefreshResult> {
    const startedAt = Date.now();
    const normalizedPaths = changedPaths.map((candidate) => normalizePath(candidate));
    if (!this.shouldRefreshForChangedPaths(graph.projectRoot, normalizedPaths, event)) {
      const result: StackEnrichmentRefreshResult = {
        mode: 'skipped',
        reason: 'no_stack_impact',
        changedPaths: normalizedPaths,
        linksAdded: 0,
      };
      oracleStore.getState().recordEnrichmentRefresh({
        mode: result.mode,
        reason: result.reason,
        durationMs: Date.now() - startedAt,
      });
      return {
        ...result,
      };
    }

    const rebuildResult = await this.rebuild(graph);
    const result: StackEnrichmentRefreshResult = {
      mode: 'rebuilt',
      reason:
        event === 'addDir' || event === 'unlinkDir'
          ? 'directory_structure_changed'
          : 'stack_runtime_path_changed',
      changedPaths: normalizedPaths,
      linksAdded: rebuildResult.linksAdded,
    };
    oracleStore.getState().recordEnrichmentRefresh({
      mode: result.mode,
      reason: result.reason,
      durationMs: Date.now() - startedAt,
    });
    return result;
  }

  /** Removes all framework and build links. */
  clear() {
    this.graphBuilder.removeLinksByTypes([...STACK_ENRICHMENT_LINK_TYPES]);
  }

  /** Whether the change can alter stack links: any directory event, or a changed file that looks like a manifest, build file, framework config, controller, service or module. */
  shouldRefreshForChangedPaths(
    projectRoot: string,
    changedPaths: string[],
    event: StackEnrichmentRefreshEvent
  ) {
    if (event === 'addDir' || event === 'unlinkDir') {
      return true;
    }

    return changedPaths.some((candidate) => {
      const normalizedCandidate = normalizePath(candidate);
      const relativeCandidate = normalizedCandidate.startsWith(normalizePath(projectRoot))
        ? normalizePath(normalizedCandidate.slice(normalizePath(projectRoot).length)).replace(
            /^\/+/u,
            ''
          )
        : normalizedCandidate.replace(/^\/+/u, '');

      return STACK_REFRESH_PATH_PATTERNS.some((pattern) => pattern.test(relativeCandidate));
    });
  }

  /** Maps a path or `path#symbol` reported by stack analysis to an existing node id. When the symbol has no node, falls back to the file node; undefined when the file is unknown. */
  private resolveNodeId(
    candidate: string,
    projectRoot: string,
    nodeIds: Set<string>,
    sourceId?: string
  ) {
    const [baseCandidate, symbolName] = candidate.split('#');
    const baseMatches = this.resolveBaseNodeId(baseCandidate, projectRoot, nodeIds, sourceId);

    if (!baseMatches) {
      return undefined;
    }

    const resolvedCandidate = symbolName ? `${baseMatches}#${symbolName}` : baseMatches;
    return nodeIds.has(resolvedCandidate)
      ? resolvedCandidate
      : symbolName
        ? baseMatches
        : resolvedCandidate;
  }

  /** Finds the file node for a path as given, relative to the project root, or relative to the folder of `sourceId`, in that order. */
  private resolveBaseNodeId(
    candidate: string,
    projectRoot: string,
    nodeIds: Set<string>,
    sourceId?: string
  ) {
    const normalizedCandidate = normalizePath(candidate);
    if (nodeIds.has(normalizedCandidate)) {
      return normalizedCandidate;
    }

    const rootRelative = normalizePath(`${projectRoot}/${candidate}`);
    if (nodeIds.has(rootRelative)) {
      return rootRelative;
    }

    if (sourceId) {
      const sourceBaseId = sourceId.split('#')[0];
      const sourceDir = normalizePath(sourceBaseId.substring(0, sourceBaseId.lastIndexOf('/')));
      const sourceRelative = normalizePath(`${sourceDir}/${candidate}`);
      if (nodeIds.has(sourceRelative)) {
        return sourceRelative;
      }
    }

    return undefined;
  }
}

/** Convenience wrapper: rebuilds enrichment through a new service, using `graph` or, when omitted, a graph assembled from the current store. */
export const rebuildStackGraphEnrichment = async (
  graphBuilder: GraphBuilder,
  graph?: GraphData
) => {
  const service = new StackGraphEnrichmentService(graphBuilder);
  return service.rebuild(
    graph || {
      projectRoot: oracleStore.getState().baseDir,
      nodes: Array.from(oracleStore.getState().nodes.values()),
      links: oracleStore.getState().links,
    }
  );
};
