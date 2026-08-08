import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron';
import type { ElectronAPI } from '../src/types/electron';

// Returning an unsubscribe handle keeps repeated subscriptions (StrictMode double
// mounts, hot reloads) from stacking listeners on the same channel forever.
const subscribe = <T>(channel: string, callback: (payload: T) => void) => {
  const listener = (_event: IpcRendererEvent, payload: T) => callback(payload);
  ipcRenderer.on(channel, listener);
  return () => {
    ipcRenderer.removeListener(channel, listener);
  };
};

const api: ElectronAPI = {
  selectDirectory: () => ipcRenderer.invoke('select-directory'),
  openDirectory: () => ipcRenderer.invoke('dialog:open-directory'),
  analyzeProject: (projectPath?: string) => ipcRenderer.invoke('analyze-project', projectPath),
  getMcpStatus: () => ipcRenderer.invoke('mcp-status'),
  minimize: () => ipcRenderer.invoke('window-minimize'),
  maximize: () => ipcRenderer.invoke('window-maximize'),
  close: () => ipcRenderer.invoke('window-close'),
  onGraphUpdate: (callback) => subscribe('graph-updated', callback),
  onParsingProgress: (callback) => subscribe('parsing-progress', callback),
  // Updater IPC
  checkForUpdates: () => ipcRenderer.invoke('updater:check'),
  installUpdate: () => ipcRenderer.invoke('updater:install'),
  getUpdaterState: () => ipcRenderer.invoke('updater:get-state'),
  onUpdaterStateChange: (callback) => {
    ipcRenderer.on('updater:state-changed', (_event, state) => callback(state));
  },
  removeUpdaterListener: () => {
    ipcRenderer.removeAllListeners('updater:state-changed');
  },

  // Recent Projects
  getRecentProjects: () => ipcRenderer.invoke('get-recent-projects'),
  clearRecentProjects: () => ipcRenderer.invoke('clear-recent-projects'),
  openRecentProject: (projectPath: string) =>
    ipcRenderer.invoke('open-recent-project', projectPath),

  // PR Impact Analysis
  analyzePRImpact: (projectPath, baseBranch, headBranch) =>
    ipcRenderer.invoke('analyze-pr-impact', projectPath, baseBranch, headBranch),

  // Blast Radius v2
  calculateBlastRadius: (projectPath, nodeId, maxDepth) =>
    ipcRenderer.invoke('calculate-blast-radius', projectPath, nodeId, maxDepth),

  // Activity Heatmap
  analyzeActivityHeatmap: (projectPath, since, until) =>
    ipcRenderer.invoke('analyze-activity-heatmap', projectPath, since, until),
};

contextBridge.exposeInMainWorld('api', api);
