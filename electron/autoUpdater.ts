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

function registerIpcHandlers(options: AutoUpdaterOptions) {
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
}

function setUpdateState(next: typeof updateState) {
  updateState = next;
  sendUpdateState();
}

function registerUpdaterListeners() {
  if (listenersRegistered) return;

  autoUpdater.on('checking-for-update', () => {
    setUpdateState({ checking: true, available: false, downloaded: false });
  });

  autoUpdater.on('update-available', (info) => {
    setUpdateState({ checking: false, available: true, downloaded: false, version: info.version });
  });

  autoUpdater.on('update-not-available', () => {
    setUpdateState({ checking: false, available: false, downloaded: false });
  });

  autoUpdater.on('download-progress', (progressObj) => {
    setUpdateState({ ...updateState, progress: Math.round(progressObj.percent) });
  });

  autoUpdater.on('update-downloaded', (info) => {
    setUpdateState({ checking: false, available: true, downloaded: true, version: info.version });
  });

  autoUpdater.on('error', (err) => {
    log.error('[AutoUpdater] Error:', err.message);
    setUpdateState({ checking: false, available: false, downloaded: false, error: err.message });
  });

  listenersRegistered = true;
}

function scheduleUpdateChecks() {
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

export function initAutoUpdater(window: BrowserWindow, options: AutoUpdaterOptions = {}) {
  mainWindow = window;

  const publishConfig = getPublishConfig();
  if (publishConfig) {
    autoUpdater.setFeedURL(publishConfig);
  }

  // IPC handlers (always register, even in dev mode)
  registerIpcHandlers(options);

  // Only check for updates in packaged mode
  if (process.env.NODE_ENV === 'development' || !app.isPackaged) {
    log.info('[AutoUpdater] Skipping update checks in development mode');

    return;
  }

  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = process.platform !== 'win32';

  registerUpdaterListeners();
  scheduleUpdateChecks();
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
