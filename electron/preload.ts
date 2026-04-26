import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('api', {
  selectDirectory: () => ipcRenderer.invoke('select-directory'),
  openDirectory: () => ipcRenderer.invoke('dialog:open-directory'),
  analyzeProject: (projectPath?: string) => ipcRenderer.invoke('analyze-project', projectPath),
  getMcpStatus: () => ipcRenderer.invoke('mcp-status'),
  minimize: () => ipcRenderer.invoke('window-minimize'),
  maximize: () => ipcRenderer.invoke('window-maximize'),
  close: () => ipcRenderer.invoke('window-close'),
  onGraphUpdate: (callback: (data: any) => void) => {
    ipcRenderer.on('graph-updated', (_event, data) => callback(data));
  },
  onParsingProgress: (callback: (data: any) => void) => {
    ipcRenderer.on('parsing-progress', (_event, data) => callback(data));
  },
  // Updater IPC
  checkForUpdates: () => ipcRenderer.invoke('updater:check'),
  installUpdate: () => ipcRenderer.invoke('updater:install'),
  getUpdaterState: () => ipcRenderer.invoke('updater:get-state'),
  onUpdaterStateChange: (callback: (state: any) => void) => {
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
  saveGraphToKuzu: (projectPath: string, graphData: any) => ipcRenderer.invoke('save-graph-to-kuzu', projectPath, graphData),
  loadGraphFromKuzu: (projectPath: string) => ipcRenderer.invoke('load-graph-from-kuzu', projectPath),
  clearGraphCache: (projectPath: string) => ipcRenderer.invoke('clear-graph-cache', projectPath),
});
