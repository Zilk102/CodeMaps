import log from 'electron-log/main';
import { autoUpdater } from 'electron-updater';
import { app, BrowserWindow, ipcMain } from 'electron';
import * as path from 'path';
import * as fs from 'fs';

let mainWindow: BrowserWindow | null = null;
let updateState: {
  checking: boolean;
  available: boolean;
  downloaded: boolean;
  version?: string;
  progress?: number;
  error?: string;
} = {
  checking: false,
  available: false,
  downloaded: false,
};

function getPublishConfig() {
  try {
    const packageJsonPath = path.join(process.resourcesPath, 'app', 'package.json');
    if (fs.existsSync(packageJsonPath)) {
      const pkg = JSON.parse(fs.readFileSync(packageJsonPath, 'utf-8'));
      return pkg.build?.publish;
    }
  } catch {
    // ignore
  }
  return undefined;
}

export function initAutoUpdater(window: BrowserWindow) {
  mainWindow = window;

  const publishConfig = getPublishConfig();
  if (publishConfig) {
    autoUpdater.setFeedURL(publishConfig);
  }

  // Only check for updates in packaged mode
  if (process.env.NODE_ENV === 'development' || !app.isPackaged) {
    log.info('[AutoUpdater] Skipping update checks in development mode');
    return;
  }

  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;

  autoUpdater.on('checking-for-update', () => {
    updateState = { checking: true, available: false, downloaded: false };
    sendUpdateState();
  });

  autoUpdater.on('update-available', (info) => {
    updateState = { checking: false, available: true, downloaded: false, version: info.version };
    sendUpdateState();
  });

  autoUpdater.on('update-not-available', () => {
    updateState = { checking: false, available: false, downloaded: false };
    sendUpdateState();
  });

  autoUpdater.on('download-progress', (progressObj) => {
    updateState = {
      ...updateState,
      progress: Math.round(progressObj.percent),
    };
    sendUpdateState();
  });

  autoUpdater.on('update-downloaded', (info) => {
    updateState = {
      checking: false,
      available: true,
      downloaded: true,
      version: info.version,
    };
    sendUpdateState();
  });

  autoUpdater.on('error', (err) => {
    log.error('[AutoUpdater] Error:', err.message);
    updateState = { checking: false, available: false, downloaded: false, error: err.message };
    sendUpdateState();
  });

  // Check for updates on startup (with a small delay to not block app launch)
  setTimeout(() => {
    autoUpdater.checkForUpdates().catch((err) => {
      log.error('[AutoUpdater] Failed to check for updates:', err.message);
    });
  }, 5000);

  // Periodic check every 4 hours
  setInterval(
    () => {
      autoUpdater.checkForUpdates().catch(() => {});
    },
    4 * 60 * 60 * 1000
  );

  // IPC handlers
  ipcMain.handle('updater:check', async () => {
    try {
      const result = await autoUpdater.checkForUpdates();
      return { success: true, updateInfo: result?.updateInfo };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle('updater:install', () => {
    autoUpdater.quitAndInstall(true, true);
  });

  ipcMain.handle('updater:get-state', () => {
    return updateState;
  });
}

function sendUpdateState() {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('updater:state-changed', updateState);
  }
}
