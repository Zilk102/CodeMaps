/** Application auto-update: check scheduling, state tracking and the IPC channels the renderer uses to show and install updates. */

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

/** Reads the `build.publish` feed settings from the packaged app's package.json, or returns undefined when they are unavailable (development, unreadable file). */
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

/**
 * Points update notifications at a new window. On macOS the window is destroyed on close and
 * rebuilt on activate, so the cached reference has to be refreshed or update notifications go
 * to a dead webContents.
 */
export function setAutoUpdaterWindow(window: BrowserWindow) {
  mainWindow = window;
}

/** Registers the `updater:check`, `updater:install` and `updater:get-state` IPC handlers. Failures are returned as `{ success: false, error }` rather than thrown. Install uses `options.onInstallRequested` when given, so the caller can shut down cleanly first. */
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

/** Mirrors electron-updater events into `updateState` (and notifies the renderer). Runs once; later calls do nothing. */
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

/** Checks for updates 5 seconds after startup (so launch is not delayed) and then every 4 hours. The timers are cleared by `shutdownAutoUpdater`. */
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

/** Sets up updating for `window`: applies the feed from package.json, registers the IPC handlers and, only in a packaged build, enables auto-download and schedules update checks. */
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

/** Cancels the scheduled checks, removes the updater listeners and drops the window reference. Safe to call when nothing was started. */
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

/** Quits the app and runs the installer of an already downloaded update; the restart is silent and relaunches the app. */
export function quitAndInstallDownloadedUpdate() {
  log.info('[AutoUpdater] Installing downloaded update');

  autoUpdater.quitAndInstall(true, true);
}
