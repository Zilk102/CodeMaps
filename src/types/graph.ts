// Renderer-side types of the dependency graph: nodes, links, refresh telemetry, layout mode and
// visibility filters.
/**
 * A vertex of the code graph: a directory, file, function, class or ADR document, with optional
 * position and export info.
 */
export interface GraphNode {
  id: string;
  label: string;
  group: number;
  type: string;
  churn?: number;
  filePath?: string;
  language?: string;
  adr?: string;
  parentId?: string;
  exports?: Array<{
    exportedName: string;
    localName?: string;
    isDefault?: boolean;
  }>;
  x?: number;
  y?: number;
  z?: number;
}

/**
 * A directed edge between two nodes (ids, or node objects once the force layout resolved them)
 * with a kind and weight.
 */
export interface GraphLink {
  source: string | GraphNode;
  target: string | GraphNode;
  value: number;
  type?: 'structure' | 'import' | 'adr' | 'entity' | 'framework' | 'build';
  reason?: string;
}

/**
 * The whole graph of the open project, plus optional telemetry about how the live refresh behaves.
 */
export interface GraphData {
  projectRoot: string;
  nodes: GraphNode[];
  links: GraphLink[];
  refreshTelemetry?: {
    watcher: {
      flushCount: number;
      batchedEventCount: number;
      coalescedFlushes: number;
      maxBatchSize: number;
      lastBatchSize: number;
      lastEvent: 'add' | 'change' | 'unlink' | 'addDir' | 'unlinkDir' | null;
      recentBatchSizes: number[];
    };
    enrichment: {
      skippedRefreshes: number;
      rebuiltRefreshes: number;
      runtimePriorityRebuilds: number;
      directoryTriggeredRebuilds: number;
      avgRefreshLatencyMs: number;
      lastRefreshMode: 'skipped' | 'rebuilt' | null;
      lastRefreshReason:
        'no_stack_impact' | 'directory_structure_changed' | 'stack_runtime_path_changed' | null;
      recentLatencyMs: number[];
      recentModes: Array<'skipped' | 'rebuilt'>;
    };
    trends: {
      watcher: {
        coalescingRatio: number;
        batchSizeTrend: 'stable' | 'improving' | 'degrading';
      };
      enrichment: {
        skipRate: number;
        runtimePriorityRate: number;
        latencyTrend: 'stable' | 'improving' | 'degrading';
        degraded: boolean;
      };
    };
  };
}

/**
 * How the canvas arranges nodes: nested containers by folder structure, or a left-to-right
 * dependency flow.
 */
export type LayoutMode = 'hierarchy' | 'dependencies';

/** Per-kind visibility switches for the graph, one flag per node kind plus one for edges. */
export interface GraphFilters {
  showDirectories: boolean;
  showFiles: boolean;
  showFunctions: boolean;
  showClasses: boolean;
  showADR: boolean;
  showEdges: boolean;
}
