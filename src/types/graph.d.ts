export interface GraphNode {
    id: string;
    label: string;
    group: number;
    type: string;
    churn?: number;
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
export interface GraphLink {
    source: string | GraphNode;
    target: string | GraphNode;
    value: number;
    type?: 'structure' | 'import' | 'adr' | 'entity' | 'framework' | 'build';
    reason?: string;
}
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
            lastRefreshReason: 'no_stack_impact' | 'directory_structure_changed' | 'stack_runtime_path_changed' | null;
            recentLatencyMs: Array<number>;
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
export type LayoutMode = 'hierarchy' | 'dependencies';
export interface GraphFilters {
    showDirectories: boolean;
    showFiles: boolean;
    showFunctions: boolean;
    showClasses: boolean;
    showADR: boolean;
    showEdges: boolean;
}
