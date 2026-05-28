import { app, BrowserWindow, ipcMain, dialog } from 'electron';
import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';
import log from 'electron-log/main';
import { getMcpStatus, setupMcpServer, shutdownMcpServer } from './mcp';
import { oracle } from './oracle';
import { oracleStore } from './store';
import { initAutoUpdater, shutdownAutoUpdater } from './autoUpdater';
import { shutdownKuzuProcessManager } from './services/KuzuGraphService';
import type { KuzuIntegration as KuzuIntegrationInstance } from './services/KuzuIntegration';
import { gracefulShutdown } from './shutdown';

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
      console.warn('[App] Restored invalid process.cwd() to:', candidate);
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

  if (isE2EShutdownTest) {
    void mainWindow.loadURL(
      'data:text/html;charset=UTF-8,' +
        encodeURIComponent('<!doctype html><html><body>CodeMaps shutdown e2e</body></html>')
    );
  } else if (!app.isPackaged) {
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

  if (isE2EShutdownTest && mainWindow) {
    mainWindow.webContents.once('did-finish-load', () => {
      setTimeout(() => {
        mainWindow?.close();
      }, e2eShutdownDelayMs);
    });
  }

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
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
    app.exit(0);
  });
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
  } catch (error: unknown) {
    return { success: false, error: getErrorMessage(error) };
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
  } catch (error: unknown) {
    return { success: false, error: getErrorMessage(error) };
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
    const KuzuIntegrationCtor = await loadKuzuIntegrationCtor();
    if (!KuzuIntegrationCtor) {
      log.warn('[KuzuDB] Persistence skipped because KuzuIntegration is unavailable');
      return;
    }

    const projectPath = graphData.projectRoot;
    const kuzu = new KuzuIntegrationCtor(projectPath);
    await kuzu.init();
    await kuzu.storeGraph(graphData);
    const stats = await kuzu.getStats();
    log.info('[KuzuDB] Graph persisted:', stats);
    await kuzu.close();
  } catch (error: unknown) {
    log.error('[KuzuDB] Failed to persist graph:', getErrorMessage(error));
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
  } catch (error: unknown) {
    log.error('[PRImpact] Analysis failed:', getErrorMessage(error));
    return { success: false, error: getErrorMessage(error) };
  }
});

// Activity Heatmap
ipcMain.handle('analyze-activity-heatmap', async (_, projectPath: string, since?: string, until?: string) => {
  try {
    const { GitActivityService } = await import('./services/GitActivityService.js');
    const service = new GitActivityService(projectPath);
    await service.init();
    const result = service.analyzeChurn(
      since ? new Date(since) : undefined,
      until ? new Date(until) : undefined
    );
    await service.close();
    return { success: true, data: result };
  } catch (error: unknown) {
    log.error('[Heatmap] Analysis failed:', getErrorMessage(error));
    return { success: false, error: getErrorMessage(error) };
  }
});

// Blast Radius v2
ipcMain.handle('calculate-blast-radius', async (_, projectPath: string, nodeId: string, maxDepth?: number) => {
  try {
    const { BlastRadiusV2 } = await import('./services/BlastRadiusV2.js');
    const analyzer = new BlastRadiusV2(projectPath);
    await analyzer.init();
    const result = await analyzer.calculate(nodeId, maxDepth || 5);
    await analyzer.close();
    return { success: true, data: result };
  } catch (error: unknown) {
    log.error('[BlastRadius] Calculation failed:', getErrorMessage(error));
    return { success: false, error: getErrorMessage(error) };
  }
});
