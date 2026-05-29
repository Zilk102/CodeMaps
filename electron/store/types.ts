export type TrendState = 'stable' | 'improving' | 'degrading';
export type RefreshEvent = 'add' | 'change' | 'unlink' | 'addDir' | 'unlinkDir';
export type RefreshMode = 'skipped' | 'rebuilt';
export type RefreshReason =
  | 'no_stack_impact'
  | 'directory_structure_changed'
  | 'stack_runtime_path_changed';

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
}

export interface GraphLink {
  source: string;
  target: string;
  value: number;
  type?: string;
  reason?: string;
}

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

export interface GraphData {
  nodes: GraphNode[];
  links: GraphLink[];
  projectRoot: string;
  refreshTelemetry?: RefreshTelemetry;
}

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

export interface RecentProject {
  path: string;
  name: string;
  lastOpened: string;
  telemetry?: RecentProjectTelemetrySnapshot;
}

export interface GraphDiff {
  nodesAdded: GraphNode[];
  nodesRemoved: string[];
  linksAdded: GraphLink[];
  linksRemoved: GraphLink[];
}

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

export interface GraphSnapshotState {
  baseDir: string;
  nodes: Map<string, GraphNode>;
  links: GraphLink[];
  refreshTelemetry: RefreshTelemetry;
}
