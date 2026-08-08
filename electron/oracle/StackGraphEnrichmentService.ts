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

export type StackEnrichmentRefreshEvent = 'add' | 'change' | 'unlink' | 'addDir' | 'unlinkDir';

export interface StackEnrichmentRefreshResult {
  mode: 'skipped' | 'rebuilt';
  reason: 'no_stack_impact' | 'directory_structure_changed' | 'stack_runtime_path_changed';
  changedPaths: string[];
  linksAdded: number;
}

export class StackGraphEnrichmentService {
  constructor(
    private readonly graphBuilder: GraphBuilder,
    private readonly stackInsightService = new StackInsightService(),
    private readonly stackTopologyService = new StackTopologyService()
  ) {}

  async rebuild(graph: GraphData) {
    const stackProfile = await this.stackInsightService.analyze(graph);
    const stackTopology = await this.stackTopologyService.analyze(graph, stackProfile);
    const nodeIds = new Set(graph.nodes.map((node) => node.id));

    const links = [...stackTopology.frameworkInsights, ...stackTopology.buildInsights]
      .flatMap((insight) => insight.relationships)
      .map((relationship) => {
        const sourceId = this.resolveNodeId(relationship.source, graph.projectRoot, nodeIds);
        const targetId = this.resolveNodeId(
          relationship.target,
          graph.projectRoot,
          nodeIds,
          sourceId
        );

        if (!sourceId || !targetId || sourceId === targetId) {
          return null;
        }

        return {
          source: sourceId,
          target: targetId,
          type: relationship.type,
          reason: relationship.reason,
        };
      })
      .filter(
        (
          relationship
        ): relationship is {
          source: string;
          target: string;
          type: 'framework' | 'build';
          reason: string;
        } => !!relationship
      )
      .map<GraphLink>((relationship) => ({
        source: relationship.source,
        target: relationship.target,
        value: 1,
        type: relationship.type,
        reason: relationship.reason,
      }));

    const dedupedLinks = links.filter((link, index, all) => {
      const key = `${link.source}->${link.target}:${link.type}:${link.reason || ''}`;
      return (
        all.findIndex(
          (candidate) =>
            `${candidate.source}->${candidate.target}:${candidate.type}:${candidate.reason || ''}` ===
            key
        ) === index
      );
    });

    this.graphBuilder.removeLinksByTypes([...STACK_ENRICHMENT_LINK_TYPES]);
    this.graphBuilder.applyEnrichmentLinks(dedupedLinks);

    return {
      stackProfile,
      stackTopology,
      linksAdded: dedupedLinks.length,
    };
  }

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

  clear() {
    this.graphBuilder.removeLinksByTypes([...STACK_ENRICHMENT_LINK_TYPES]);
  }

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
