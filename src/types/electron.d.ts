// Global types for Electron API exposed via preload.ts

import type { GraphData } from './graph';

export interface UpdateState {
  checking: boolean;
  available: boolean;
  downloaded: boolean;
  version?: string;
  progress?: number;
  error?: string;
}

export interface RecentProject {
  path: string;
  name: string;
  lastOpened: string;
  telemetry?: {
    updatedAt: string;
    degraded: boolean;
    avgRefreshLatencyMs: number;
    skipRate: number;
    coalescingRatio: number;
    runtimePriorityRate: number;
    latencyTrend: 'stable' | 'improving' | 'degrading';
    batchSizeTrend: 'stable' | 'improving' | 'degrading';
    maxBatchSize: number;
    lastBatchSize: number;
    lastRefreshMode: 'skipped' | 'rebuilt' | null;
    lastRefreshReason:
      | 'no_stack_impact'
      | 'directory_structure_changed'
      | 'stack_runtime_path_changed'
      | null;
  };
}

export interface ElectronAPI {
  selectDirectory: () => Promise<string | null>;
  openDirectory: () => Promise<string | null>;
  analyzeProject: (
    projectPath?: string
  ) => Promise<{ success: boolean; data?: GraphData; error?: string }>;
  getMcpStatus: () => Promise<unknown>;
  minimize: () => Promise<void>;
  maximize: () => Promise<void>;
  close: () => Promise<void>;
  /** Returns an unsubscribe function. */
  onGraphUpdate: (callback: (data: GraphData) => void) => () => void;
  /** Returns an unsubscribe function. */
  onParsingProgress: (
    callback: (data: { status: string; current: number; total: number; filename: string }) => void
  ) => () => void;
  // Updater
  checkForUpdates: () => Promise<{ success: boolean; updateInfo?: unknown; error?: string }>;
  installUpdate: () => Promise<void>;
  getUpdaterState: () => Promise<UpdateState>;
  onUpdaterStateChange: (callback: (state: UpdateState) => void) => void;
  removeUpdaterListener: () => void;

  // Recent Projects
  getRecentProjects: () => Promise<RecentProject[]>;
  clearRecentProjects: () => Promise<void>;
  openRecentProject: (projectPath: string) => Promise<{ success: boolean; data?: GraphData; error?: string }>;

  // Blast Radius v2
  calculateBlastRadius: (projectPath: string, nodeId: string, maxDepth?: number) => Promise<{
    success: boolean;
    data?: {
      targetNode: string;
      directDependencies: Array<{
        id: string;
        label: string;
        type: string;
        distance: number;
        path: string[];
      }>;
      transitiveDependencies: Array<{
        id: string;
        label: string;
        type: string;
        distance: number;
        path: string[];
      }>;
      totalAffected: number;
      maxDepth: number;
      riskPaths: string[][];
    };
    error?: string;
  }>;

  // PR Impact Analysis
  analyzePRImpact: (projectPath: string, baseBranch: string, headBranch: string) => Promise<{
    success: boolean;
    data?: {
      changedFiles: Array<{
        path: string;
        status: 'added' | 'modified' | 'deleted';
        additions: number;
        deletions: number;
      }>;
      affectedNodes: string[];
      blastRadius: number;
      riskScore: 'low' | 'medium' | 'high' | 'critical';
      recommendations: string[];
    };
    error?: string;
  }>;

  // Activity Heatmap
  analyzeActivityHeatmap: (projectPath: string, since?: string, until?: string) => Promise<{
    success: boolean;
    data?: {
      files: Array<{
        filePath: string;
        commits: number;
        additions: number;
        deletions: number;
        lastModified: string;
        authors: string[];
      }>;
      maxCommits: number;
      maxChanges: number;
      totalFiles: number;
      timeRange: { from: string; to: string };
    };
    error?: string;
  }>;
}

declare global {
  interface Window {
    api: ElectronAPI;
  }
}
