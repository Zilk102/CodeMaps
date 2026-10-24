/** Shared data model of the graph store: nodes, links, refresh telemetry, recent projects and the store's state shape. */

import type { FileResolutionFacts } from '../parsing/types';

/** Direction of a measured series: `improving`, `degrading`, or `stable` when changes are small or there are too few samples. */
export type TrendState = 'stable' | 'improving' | 'degrading';
/** Kind of file-system change the watcher reports (chokidar event names). */
export type RefreshEvent = 'add' | 'change' | 'unlink' | 'addDir' | 'unlinkDir';
/** Outcome of an enrichment refresh: `skipped` when the change cannot affect the stack graph, `rebuilt` when the links were recomputed. */
export type RefreshMode = 'skipped' | 'rebuilt';
/** Why an enrichment refresh was skipped or rebuilt: no impact, a changed directory structure, or a changed runtime/stack path. */
export type RefreshReason =
  'no_stack_impact' | 'directory_structure_changed' | 'stack_runtime_path_changed';

/**
 * A directory, file, symbol or ADR in the project graph. Ids are forward-slash paths; a symbol is `<file id>#<name>`.
 * `group` and `parentId` are layout/containment data, `churn` the git change count of the file.
 */
export interface GraphNode {
  id: string;
  label: string;
  group: number;
  type: string;
  churn: number;
  filePath?: string;
  language?: string;
  sourceLocation?: {
    startLine: number;
    startColumn: number;
    endLine: number;
    endColumn: number;
  };
  adr?: string;
  parentId?: string;
  exports?: Array<{
    exportedName: string;
    localName?: string;
    isDefault?: boolean;
  }>;
  /** Barrel forwarding: resolved target file and the original names it re-exports ('*' = all). */
  reExports?: Array<{
    target: string;
    entities: string[];
  }>;
  /** Raw import facts of Go/Python/Java/Rust files, resolved against the project after indexing. */
  resolution?: FileResolutionFacts;
}

/** A directed relation from `source` to `target` (node ids). `type` names the relation (for example `structure` for containment), `reason` explains inferred links and `value` is the weight. */
export interface GraphLink {
  source: string;
  target: string;
  value: number;
  type?: string;
  reason?: string;
}

/** Counters and derived trends describing how well incremental refresh keeps up: watcher batching on one side, enrichment rebuilds on the other. `recent*` arrays hold only the last few samples. */
export interface RefreshTelemetry {
  watcher: {
    flushCount: number;
    batchedEventCount: number;
    coalescedFlushes: number;
    maxBatchSize: number;
    lastBatchSize: number;
    lastEvent: RefreshEvent | null;
    recentBatchSizes: number[];
  };
  enrichment: {
    skippedRefreshes: number;
    rebuiltRefreshes: number;
    runtimePriorityRebuilds: number;
    directoryTriggeredRebuilds: number;
    avgRefreshLatencyMs: number;
    lastRefreshMode: RefreshMode | null;
    lastRefreshReason: RefreshReason | null;
    recentLatencyMs: number[];
    recentModes: RefreshMode[];
  };
  trends: {
    watcher: {
      coalescingRatio: number;
      batchSizeTrend: TrendState;
    };
    enrichment: {
      skipRate: number;
      runtimePriorityRate: number;
      latencyTrend: TrendState;
      degraded: boolean;
    };
  };
}

/** A complete graph snapshot as served to the renderer and MCP tools; `projectRoot` is empty when no project is open. */
export interface GraphData {
  nodes: GraphNode[];
  links: GraphLink[];
  projectRoot: string;
  refreshTelemetry?: RefreshTelemetry;
}

/** Refresh telemetry condensed for storage next to a recent project, so the project list can flag projects with slow or unstable updates. */
export interface RecentProjectTelemetrySnapshot {
  updatedAt: string;
  degraded: boolean;
  avgRefreshLatencyMs: number;
  skipRate: number;
  coalescingRatio: number;
  runtimePriorityRate: number;
  latencyTrend: TrendState;
  batchSizeTrend: TrendState;
  maxBatchSize: number;
  lastBatchSize: number;
  lastRefreshMode: RefreshMode | null;
  lastRefreshReason: RefreshReason | null;
}

/** An entry of the persisted recent-projects list. `lastOpened` is an ISO timestamp. */
export interface RecentProject {
  path: string;
  name: string;
  lastOpened: string;
  telemetry?: RecentProjectTelemetrySnapshot;
}

/** Changes accumulated since the last time the diff was taken; links are listed by value, nodes removed by id. */
export interface GraphDiff {
  nodesAdded: GraphNode[];
  nodesRemoved: string[];
  linksAdded: GraphLink[];
  linksRemoved: GraphLink[];
}

/** State and actions of the graph store. The revision counters increase on every change of nodes, links or telemetry so derived data can be cached cheaply; mutating actions also record into `pendingDiff`. */
export interface OracleState {
  baseDir: string;
  nodes: Map<string, GraphNode>;
  links: GraphLink[];
  churnMap: Map<string, number>;
  nodeRevision: number;
  linkRevision: number;
  telemetryRevision: number;
  recentProjects: RecentProject[];
  refreshTelemetry: RefreshTelemetry;
  pendingDiff: GraphDiff;

  setBaseDir: (dir: string) => void;
  setChurnMap: (map: Map<string, number>) => void;
  resetRefreshTelemetry: () => void;
  recordWatcherFlush: (batchSize: number, event: RefreshEvent) => void;
  recordEnrichmentRefresh: (entry: {
    mode: RefreshMode;
    reason: RefreshReason;
    durationMs: number;
  }) => void;

  upsertNode: (node: GraphNode) => void;
  removeNode: (id: string) => void;
  removeNodesPrefix: (prefix: string) => void;

  addLink: (link: GraphLink) => void;
  removeLinksBySource: (source: string) => void;
  removeLinksBySourceOrTarget: (id: string) => void;
  removeLinksByTypes: (types: string[]) => void;
  /** Swaps every link matching `isOwned` for `links` in one update (bulk, unlike addLink). */
  replaceLinks: (isOwned: (link: GraphLink) => boolean, links: GraphLink[]) => void;

  restoreCache: (nodes: GraphNode[], links: GraphLink[]) => void;
  clear: () => void;
  getValidGraph: () => GraphData;

  resetDiff: () => void;
  getAndResetDiff: () => GraphDiff;

  addRecentProject: (
    projectPath: string,
    projectName: string,
    refreshTelemetry?: RefreshTelemetry
  ) => void;
  updateRecentProjectTelemetry: (projectPath: string, refreshTelemetry: RefreshTelemetry) => void;
  clearRecentProjects: () => void;
}

/** The slice of `OracleState` needed to build a `GraphData` snapshot. */
export interface GraphSnapshotState {
  baseDir: string;
  nodes: Map<string, GraphNode>;
  links: GraphLink[];
  refreshTelemetry: RefreshTelemetry;
}
