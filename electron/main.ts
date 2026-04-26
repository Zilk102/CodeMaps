import { app, BrowserWindow, ipcMain, dialog } from 'electron';
import * as path from 'path';
import log from 'electron-log/main';
import { getMcpStatus, setupMcpServer } from './mcp';
import { oracle } from './oracle';
import { oracleStore } from './store';
import { initAutoUpdater } from './autoUpdater';
import { KuzuIntegration } from './services/KuzuIntegration';

// Initialize structured logging
log.initialize({ preload: true });
log.transports.file.level = 'info';
log.transports.console.level = 'debug';

// Crash Reporting (Global error handlers)
process.on('uncaughtException', (error) => {
  log.error('Uncaught Exception:', error);
});

process.on('unhandledRejection', (reason, promise) => {
  log.error('Unhandled Rejection at:', promise, 'reason:', reason);
});

let mainWindow: BrowserWindow | null = null;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
    backgroundColor: '#0f111a',
    titleBarStyle: 'hidden',
    frame: false,
    titleBarOverlay: false,
  });

  if (!app.isPackaged) {
    mainWindow.loadURL('http://localhost:5173');
    mainWindow.webContents.openDevTools();
  } else {
    mainWindow.loadFile(path.join(__dirname, '../dist-renderer/index.html'));
  }
}

ipcMain.handle('window-minimize', () => {
  mainWindow?.minimize();
});

ipcMain.handle('window-maximize', () => {
  if (mainWindow?.isMaximized()) {
    mainWindow.unmaximize();
  } else {
    mainWindow?.maximize();
  }
});

ipcMain.handle('window-close', () => {
  mainWindow?.close();
});

app.whenReady().then(() => {
  createWindow();
  setupMcpServer();
  initAutoUpdater(mainWindow!);

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

ipcMain.handle('select-directory', async () => {
  if (!mainWindow) return null;
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openDirectory'],
  });
  return result.canceled ? null : result.filePaths[0];
});

// Alias for dialog:open-directory (fallback button)
ipcMain.handle('dialog:open-directory', async () => {
  if (!mainWindow) return null;
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openDirectory'],
  });
  return result.canceled ? null : result.filePaths[0];
});

ipcMain.handle('analyze-project', async (_, projectPath: string) => {
  try {
    const data = await oracle.analyzeProject(projectPath || process.cwd());
    return { success: true, data };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('mcp-status', () => {
  return getMcpStatus();
});

// Recent Projects IPC
ipcMain.handle('get-recent-projects', () => {
  return oracleStore.getState().recentProjects;
});

ipcMain.handle('clear-recent-projects', () => {
  oracleStore.getState().clearRecentProjects();
});

ipcMain.handle('open-recent-project', async (_, projectPath: string) => {
  try {
    const data = await oracle.analyzeProject(projectPath);
    return { success: true, data };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
});

// Проксируем события Оракула в UI
oracle.on('parsing-progress', (progress) => {
  if (mainWindow) {
    mainWindow.webContents.send('parsing-progress', progress);
  }
});

oracle.on('graph-updated', async (graphData) => {
  if (mainWindow) {
    mainWindow.webContents.send('graph-updated', graphData);
  }
  
  // Store in KuzuDB for persistence and querying
  try {
    const projectPath = graphData.projectRoot;
    const kuzu = new KuzuIntegration(projectPath);
    await kuzu.init();
    await kuzu.storeGraph(graphData);
    const stats = await kuzu.getStats();
    log.info('[KuzuDB] Graph persisted:', stats);
    await kuzu.close();
  } catch (err: any) {
    log.error('[KuzuDB] Failed to persist graph:', err.message);
  }
});

// PR Impact Analysis
ipcMain.handle('analyze-pr-impact', async (_, projectPath: string, baseBranch: string, headBranch: string) => {
  try {
    const { PRImpactAnalyzer } = await import('./services/PRImpactAnalyzer.js');
    const analyzer = new PRImpactAnalyzer(projectPath);
    await analyzer.init();
    const result = await analyzer.analyzePR(baseBranch, headBranch);
    await analyzer.close();
    return { success: true, data: result };
  } catch (error: any) {
    log.error('[PRImpact] Analysis failed:', error.message);
    return { success: false, error: error.message };
  }
});
