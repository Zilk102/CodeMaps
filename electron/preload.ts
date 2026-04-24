import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('api', {
  selectDirectory: () => ipcRenderer.invoke('select-directory'),
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
  }
});
