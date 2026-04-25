// Global types for Electron API exposed via preload.ts

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
  analyzeProject: (
    projectPath?: string
  ) => Promise<{ success: boolean; data?: any; error?: string }>;
  getMcpStatus: () => Promise<any>;
  minimize: () => Promise<void>;
  maximize: () => Promise<void>;
  close: () => Promise<void>;
  onGraphUpdate: (callback: (data: any) => void) => void;
  onParsingProgress: (callback: (data: any) => void) => void;
  // Updater
  checkForUpdates: () => Promise<{ success: boolean; updateInfo?: any; error?: string }>;
  installUpdate: () => Promise<void>;
  getUpdaterState: () => Promise<UpdateState>;
  onUpdaterStateChange: (callback: (state: UpdateState) => void) => void;
  removeUpdaterListener: () => void;

  // Recent Projects
  getRecentProjects: () => Promise<RecentProject[]>;
  clearRecentProjects: () => Promise<void>;
  openRecentProject: (projectPath: string) => Promise<{ success: boolean; data?: any; error?: string }>;
}

declare global {
  interface Window {
    api: ElectronAPI;
  }
}
