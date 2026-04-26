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
  onGraphUpdate: (callback: (data: GraphData) => void) => void;
  onParsingProgress: (callback: (data: { current: number; total: number; filename: string }) => void) => void;
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
}

declare global {
  interface Window {
    api: ElectronAPI;
  }
}
