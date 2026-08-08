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
let startupCheckTimeout: ReturnType<typeof setTimeout> | null = null;
let periodicCheckInterval: ReturnType<typeof setInterval> | null = null;
let listenersRegistered = false;

interface AutoUpdaterOptions {
  onInstallRequested?: () => Promise<void> | void;
}

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

// On macOS the window is destroyed on close and rebuilt on activate, so the cached
// reference has to be refreshed or update notifications go to a dead webContents.
export function setAutoUpdaterWindow(window: BrowserWindow) {
  mainWindow = window;
}

export function initAutoUpdater(window: BrowserWindow, options: AutoUpdaterOptions = {}) {
  mainWindow = window;

  const publishConfig = getPublishConfig();
  if (publishConfig) {
    autoUpdater.setFeedURL(publishConfig);
  }

  // IPC handlers (always register, even in dev mode)
  ipcMain.handle('updater:check', async () => {
    try {
      const result = await autoUpdater.checkForUpdates();
      return { success: true, updateInfo: result?.updateInfo };
    } catch (err: unknown) {
      return { success: false, error: err instanceof Error ? err.message : String(err) };
    }
  });

  ipcMain.handle('updater:install', async () => {
    try {
      if (options.onInstallRequested) {
        await options.onInstallRequested();
      } else {
        quitAndInstallDownloadedUpdate();
      }

      return { success: true };
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      log.error('[AutoUpdater] Failed to install update:', message);
      return { success: false, error: message };
    }
  });

  ipcMain.handle('updater:get-state', () => {
    return updateState;
  });

  // Only check for updates in packaged mode
  if (process.env.NODE_ENV === 'development' || !app.isPackaged) {
    log.info('[AutoUpdater] Skipping update checks in development mode');
    return;
  }

  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;

  if (!listenersRegistered) {
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

    listenersRegistered = true;
  }

  // Check for updates on startup (with a small delay to not block app launch)
  startupCheckTimeout = setTimeout(() => {
    autoUpdater.checkForUpdates().catch((err) => {
      log.error('[AutoUpdater] Failed to check for updates:', err.message);
    });
  }, 5000);

  // Periodic check every 4 hours
  periodicCheckInterval = setInterval(
    () => {
      autoUpdater.checkForUpdates().catch(() => {});
    },
    4 * 60 * 60 * 1000
  );
}

export function shutdownAutoUpdater() {
  if (startupCheckTimeout) {
    clearTimeout(startupCheckTimeout);
    startupCheckTimeout = null;
  }

  if (periodicCheckInterval) {
    clearInterval(periodicCheckInterval);
    periodicCheckInterval = null;
  }

  if (listenersRegistered) {
    autoUpdater.removeAllListeners();
    listenersRegistered = false;
  }

  mainWindow = null;
}

function sendUpdateState() {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('updater:state-changed', updateState);
  }
}

export function quitAndInstallDownloadedUpdate() {
  log.info('[AutoUpdater] Installing downloaded update');
  autoUpdater.quitAndInstall(true, true);
}
