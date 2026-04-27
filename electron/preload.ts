import { contextBridge, ipcRenderer } from 'electron';
import type { ElectronAPI } from '../src/types/electron';

const api: ElectronAPI = {
  selectDirectory: () => ipcRenderer.invoke('select-directory'),
  openDirectory: () => ipcRenderer.invoke('dialog:open-directory'),
  analyzeProject: (projectPath?: string) => ipcRenderer.invoke('analyze-project', projectPath),
  getMcpStatus: () => ipcRenderer.invoke('mcp-status'),
  minimize: () => ipcRenderer.invoke('window-minimize'),
  maximize: () => ipcRenderer.invoke('window-maximize'),
  close: () => ipcRenderer.invoke('window-close'),
  onGraphUpdate: (callback) => {
    ipcRenderer.on('graph-updated', (_event, data) => callback(data));
  },
  onParsingProgress: (callback) => {
    ipcRenderer.on('parsing-progress', (_event, data) => callback(data));
  },
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
  openRecentProject: (projectPath: string) => ipcRenderer.invoke('open-recent-project', projectPath),

  // Graph Persistence
  saveGraphToKuzu: (projectPath, graphData) => ipcRenderer.invoke('save-graph-to-kuzu', projectPath, graphData),
  loadGraphFromKuzu: (projectPath) => ipcRenderer.invoke('load-graph-from-kuzu', projectPath),
  clearGraphCache: (projectPath) => ipcRenderer.invoke('clear-graph-cache', projectPath),

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
