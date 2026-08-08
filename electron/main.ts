import { app, BrowserWindow, dialog, ipcMain, shell } from 'electron';
import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';
import log from 'electron-log/main';
import { getMcpStatus, setupMcpServer, shutdownMcpServer } from './mcp';
import { oracle } from './oracle';
import {
  initAutoUpdater,
  quitAndInstallDownloadedUpdate,
  setAutoUpdaterWindow,
  shutdownAutoUpdater,
} from './autoUpdater';
import { shutdownKuzuProcessManager } from './services/KuzuGraphService';
import type { KuzuIntegration as KuzuIntegrationInstance } from './services/KuzuIntegration';
import { gracefulShutdown } from './shutdown';
import { registerMainProcessBindings } from './mainProcessBindings';

const isE2EShutdownTest = process.env.CODEMAPS_E2E_SHUTDOWN_TEST === '1';
const e2eShutdownDelayMs = Number(process.env.CODEMAPS_E2E_SHUTDOWN_DELAY_MS || '750');
type KuzuIntegrationCtor = new (projectPath: string) => KuzuIntegrationInstance;
let kuzuIntegrationCtorPromise: Promise<KuzuIntegrationCtor | null> | null = null;

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function loadKuzuIntegrationCtor(): Promise<KuzuIntegrationCtor | null> {
  if (!kuzuIntegrationCtorPromise) {
    kuzuIntegrationCtorPromise = import('./services/KuzuIntegration.js')
      .then((kuzuModule) => {
        log.info('[App] KuzuIntegration loaded successfully');
        return kuzuModule.KuzuIntegration;
      })
      .catch((error: unknown) => {
        log.error('[App] KuzuIntegration failed to load:', getErrorMessage(error));
        return null;
      });
  }

  return kuzuIntegrationCtorPromise;
}

function ensureSafeProcessCwd(): void {
  try {
    const currentCwd = process.cwd();
    if (fs.existsSync(currentCwd)) {
      return;
    }
  } catch {
    // Fall through to pick a known-good directory.
  }

  const candidates = [
    process.env.CODEMAPS_ROOT,
    process.env.LOCALAPPDATA ? path.join(process.env.LOCALAPPDATA, 'CodeMaps') : undefined,
    process.env.APPDATA ? path.join(process.env.APPDATA, 'CodeMaps') : undefined,
    path.resolve(__dirname, '..'),
    path.dirname(process.execPath),
    os.tmpdir(),
  ].filter((candidate): candidate is string => Boolean(candidate));

  for (const candidate of candidates) {
    try {
      if (!fs.existsSync(candidate)) {
        fs.mkdirSync(candidate, { recursive: true });
      }
      process.chdir(candidate);
      log.warn('[App] Restored invalid process.cwd() to:', candidate);
      return;
    } catch {
      // Try the next candidate.
    }
  }
}

ensureSafeProcessCwd();
void loadKuzuIntegrationCtor();

// Initialize structured logging
log.initialize({ preload: true });
log.transports.file.level = 'info';
log.transports.console.level = 'debug';

// Crash Reporting (Global error handlers)
process.on('uncaughtException', (error) => {
  log.error('Uncaught Exception:', error);
  dialog.showErrorBox(
    'Critical Application Error',
    `A critical error occurred and CodeMaps may become unstable.\n\nError: ${getErrorMessage(error)}\n\nPlease restart the application if you experience issues.`
  );
  // Sentry.captureException(error); // Placeholder for Sentry/Bugsnag
});

process.on('unhandledRejection', (reason, promise) => {
  log.error('Unhandled Rejection at:', promise, 'reason:', reason);
  dialog.showErrorBox(
    'Background Task Failed',
    `An unexpected error occurred in a background process.\n\nError: ${getErrorMessage(reason)}`
  );
  // Sentry.captureException(reason); // Placeholder for Sentry/Bugsnag
});

let mainWindow: BrowserWindow | null = null;
let shutdownStarted = false;
let updateInstallStarted = false;

async function shutdownApplication() {
  if (shutdownStarted) {
    return;
  }

  shutdownStarted = true;
  await gracefulShutdown({
    shutdownAutoUpdater,
    shutdownMcpServer,
    shutdownOracle: () => oracle.close(),
    shutdownKuzuProcessManager,
    logger: log,
  });
}

async function installDownloadedUpdate() {
  if (updateInstallStarted) {
    return;
  }

  updateInstallStarted = true;

  try {
    log.info('[App] Preparing downloaded update installation');
    await shutdownApplication();
    quitAndInstallDownloadedUpdate();
  } catch (error: unknown) {
    updateInstallStarted = false;
    log.error('[App] Failed to prepare update installation:', getErrorMessage(error));
    throw error;
  }
}

const DEV_SERVER_ORIGIN = 'http://localhost:5173';

// The renderer only ever needs its own bundle. Anything else — a link in an ADR
// comment, an injected iframe — must go to the user's browser rather than gain a
// window that shares this app's preload bridge.
function hardenWebContents(window: BrowserWindow) {
  const isAllowedInternalUrl = (url: string) =>
    url.startsWith('file://') ||
    url.startsWith(DEV_SERVER_ORIGIN) ||
    url.startsWith('data:text/html');

  window.webContents.on('will-navigate', (event, url) => {
    if (!isAllowedInternalUrl(url)) {
      event.preventDefault();
      void shell.openExternal(url);
    }
  });

  window.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//.test(url)) {
      void shell.openExternal(url);
    }
    return { action: 'deny' };
  });

  window.webContents.on('will-attach-webview', (event) => {
    event.preventDefault();
  });
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
      allowRunningInsecureContent: false,
      webviewTag: false,
    },
    backgroundColor: '#0f111a',
    titleBarStyle: 'hidden',
    frame: false,
    titleBarOverlay: false,
  });

  hardenWebContents(mainWindow);

  if (isE2EShutdownTest) {
    void mainWindow.loadURL(
      'data:text/html;charset=UTF-8,' +
        encodeURIComponent('<!doctype html><html><body>CodeMaps shutdown e2e</body></html>')
    );
  } else if (!app.isPackaged) {
    mainWindow.loadURL(DEV_SERVER_ORIGIN);
    mainWindow.webContents.openDevTools();
  } else {
    mainWindow.loadFile(path.join(__dirname, '../dist-renderer/index.html'));
  }
}

registerMainProcessBindings({
  ipcMain,
  getMainWindow: () => mainWindow,
  getMcpStatus,
  getErrorMessage,
  logger: log,
  loadKuzuIntegrationCtor,
});

app.whenReady().then(() => {
  createWindow();
  setupMcpServer();
  initAutoUpdater(mainWindow!, {
    onInstallRequested: () => installDownloadedUpdate(),
  });

  if (isE2EShutdownTest && mainWindow) {
    mainWindow.webContents.once('did-finish-load', () => {
      setTimeout(() => {
        mainWindow?.close();
      }, e2eShutdownDelayMs);
    });
  }

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length > 0) {
      return;
    }

    createWindow();
    if (mainWindow) {
      setAutoUpdaterWindow(mainWindow);
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('before-quit', (event) => {
  if (shutdownStarted) {
    return;
  }

  event.preventDefault();
  void shutdownApplication().finally(() => {
    app.quit();
  });
});
