import { app, BrowserWindow, ipcMain, dialog } from 'electron';
import * as path from 'path';
import { getMcpStatus, setupMcpServer } from './mcp';
import { oracle } from './oracle';
import { oracleStore } from './store';
import { initAutoUpdater } from './autoUpdater';

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

// Проксируем события Оракула в UI
oracle.on('parsing-progress', (progress) => {
  if (mainWindow) {
    mainWindow.webContents.send('parsing-progress', progress);
  }
});

oracle.on('graph-updated', (graphData) => {
  if (mainWindow) {
    mainWindow.webContents.send('graph-updated', graphData);
  }
});
