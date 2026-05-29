import { BrowserWindow, dialog, IpcMain } from 'electron';
import { oracle } from './oracle';
import { oracleStore } from './store';
import { persistGraphToKuzu } from './graphPersistence';

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
    async (_, projectPath: string, baseBranch: string, headBranch: string) => {
      try {
        const { PRImpactAnalyzer } = await import('./services/PRImpactAnalyzer.js');
        const analyzer = new PRImpactAnalyzer(projectPath);
        await analyzer.init();
        const result = await analyzer.analyzePR(baseBranch, headBranch);
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
    async (_, projectPath: string, since?: string, until?: string) => {
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
        logger.error('[Heatmap] Analysis failed:', getErrorMessage(error));
        return { success: false, error: getErrorMessage(error) };
      }
    }
  );

  ipcMain.handle(
    'calculate-blast-radius',
    async (_, projectPath: string, nodeId: string, maxDepth?: number) => {
      try {
        const { BlastRadiusV2 } = await import('./services/BlastRadiusV2.js');
        const analyzer = new BlastRadiusV2(projectPath);
        await analyzer.init();
        const result = await analyzer.calculate(nodeId, maxDepth || 5);
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
