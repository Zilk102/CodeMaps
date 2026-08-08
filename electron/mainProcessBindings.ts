import { BrowserWindow, dialog, IpcMain } from 'electron';
import * as fs from 'fs';
import { oracle } from './oracle';
import { oracleStore } from './store';
import { persistGraphToKuzu } from './graphPersistence';

// Renderer arguments arrive unvalidated over IPC, and every analytics handler feeds
// its project path straight into git and the filesystem.
function requireProjectDirectory(value: unknown): string {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new Error('A project path is required');
  }

  if (!fs.existsSync(value) || !fs.statSync(value).isDirectory()) {
    throw new Error(`Not a directory: ${value}`);
  }

  return value;
}

function requireString(value: unknown, label: string): string {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new Error(`${label} is required`);
  }

  return value;
}

interface LoggerLike {
  info: (...args: unknown[]) => void;
  warn: (...args: unknown[]) => void;
  error: (...args: unknown[]) => void;
}

interface RegisterMainProcessBindingsInput {
  ipcMain: IpcMain;
  getMainWindow: () => BrowserWindow | null;
  getMcpStatus: () => unknown;
  getErrorMessage: (error: unknown) => string;
  logger: LoggerLike;
  loadKuzuIntegrationCtor: () => Promise<any>;
}

export function registerMainProcessBindings(input: RegisterMainProcessBindingsInput) {
  registerWindowBindings(input.ipcMain, input.getMainWindow);
  registerProjectBindings(
    input.ipcMain,
    input.getMainWindow,
    input.getMcpStatus,
    input.getErrorMessage
  );
  registerAnalyticsBindings(input.ipcMain, input.getErrorMessage, input.logger);
  registerOracleBridges(
    input.getMainWindow,
    input.loadKuzuIntegrationCtor,
    input.logger,
    input.getErrorMessage
  );
}

function registerWindowBindings(ipcMain: IpcMain, getMainWindow: () => BrowserWindow | null) {
  ipcMain.handle('window-minimize', () => {
    getMainWindow()?.minimize();
  });

  ipcMain.handle('window-maximize', () => {
    const mainWindow = getMainWindow();
    if (mainWindow?.isMaximized()) {
      mainWindow.unmaximize();
    } else {
      mainWindow?.maximize();
    }
  });

  ipcMain.handle('window-close', () => {
    getMainWindow()?.close();
  });
}

function registerProjectBindings(
  ipcMain: IpcMain,
  getMainWindow: () => BrowserWindow | null,
  getMcpStatus: () => unknown,
  getErrorMessage: (error: unknown) => string
) {
  const openDirectoryDialog = async () => {
    const mainWindow = getMainWindow();
    if (!mainWindow) {
      return null;
    }

    const result = await dialog.showOpenDialog(mainWindow, {
      properties: ['openDirectory'],
    });
    return result.canceled ? null : result.filePaths[0];
  };

  const analyzeProject = async (projectPath: string) => {
    try {
      const data = await oracle.analyzeProject(projectPath || process.cwd());
      return { success: true, data };
    } catch (error: unknown) {
      return { success: false, error: getErrorMessage(error) };
    }
  };

  ipcMain.handle('select-directory', openDirectoryDialog);
  ipcMain.handle('dialog:open-directory', openDirectoryDialog);
  ipcMain.handle('analyze-project', async (_, projectPath: string) => analyzeProject(projectPath));
  ipcMain.handle('mcp-status', () => getMcpStatus());
  ipcMain.handle('get-recent-projects', () => oracleStore.getState().recentProjects);
  ipcMain.handle('clear-recent-projects', () => {
    oracleStore.getState().clearRecentProjects();
  });
  ipcMain.handle('open-recent-project', async (_, projectPath: string) => analyzeProject(projectPath));
}

function registerAnalyticsBindings(
  ipcMain: IpcMain,
  getErrorMessage: (error: unknown) => string,
  logger: LoggerLike
) {
  ipcMain.handle(
    'analyze-pr-impact',
    async (_, rawProjectPath: unknown, baseBranch: unknown, headBranch: unknown) => {
      try {
        const projectPath = requireProjectDirectory(rawProjectPath);
        const { PRImpactAnalyzer } = await import('./services/PRImpactAnalyzer.js');
        const analyzer = new PRImpactAnalyzer(projectPath);
        await analyzer.init();
        const result = await analyzer.analyzePR(
          requireString(baseBranch, 'Base branch'),
          requireString(headBranch, 'Head branch')
        );
        await analyzer.close();
        return { success: true, data: result };
      } catch (error: unknown) {
        logger.error('[PRImpact] Analysis failed:', getErrorMessage(error));
        return { success: false, error: getErrorMessage(error) };
      }
    }
  );

  ipcMain.handle(
    'analyze-activity-heatmap',
    async (_, rawProjectPath: unknown, since?: string, until?: string) => {
      try {
        const projectPath = requireProjectDirectory(rawProjectPath);
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
        logger.error('[Heatmap] Analysis failed:', getErrorMessage(error));
        return { success: false, error: getErrorMessage(error) };
      }
    }
  );

  ipcMain.handle(
    'calculate-blast-radius',
    async (_, rawProjectPath: unknown, nodeId: unknown, maxDepth?: number) => {
      try {
        const projectPath = requireProjectDirectory(rawProjectPath);
        const { BlastRadiusV2 } = await import('./services/BlastRadiusV2.js');
        const analyzer = new BlastRadiusV2(projectPath);
        await analyzer.init();
        const result = await analyzer.calculate(requireString(nodeId, 'Node id'), maxDepth || 5);
        await analyzer.close();
        return { success: true, data: result };
      } catch (error: unknown) {
        logger.error('[BlastRadius] Calculation failed:', getErrorMessage(error));
        return { success: false, error: getErrorMessage(error) };
      }
    }
  );
}

function registerOracleBridges(
  getMainWindow: () => BrowserWindow | null,
  loadKuzuIntegrationCtor: () => Promise<any>,
  logger: LoggerLike,
  getErrorMessage: (error: unknown) => string
) {
  oracle.on('parsing-progress', (progress) => {
    getMainWindow()?.webContents.send('parsing-progress', progress);
  });

  oracle.on('graph-updated', async (graphData) => {
    getMainWindow()?.webContents.send('graph-updated', graphData);
    await persistGraphToKuzu(graphData, loadKuzuIntegrationCtor, logger, getErrorMessage);
  });
}
