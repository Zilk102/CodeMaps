/** IPC handlers of the main process: window controls, project opening, analytics and graph forwarding to the renderer. */

import { BrowserWindow, dialog, IpcMain } from 'electron';
import * as fs from 'fs';
import { oracle } from './oracle';
import { oracleStore } from './store';
import { createSerializedPersister, persistGraphToKuzu } from './graphPersistence';

/**
 * Validates a project path received over IPC and returns it. Renderer arguments arrive
 * unvalidated, and every analytics handler feeds its project path straight into git and the
 * filesystem. Throws unless the value is a non-empty string naming an existing directory.
 */
function requireProjectDirectory(value: unknown): string {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new Error('A project path is required');
  }

  if (!fs.existsSync(value) || !fs.statSync(value).isDirectory()) {
    throw new Error(`Not a directory: ${value}`);
  }

  return value;
}

/** Returns `value` when it is a non-empty string, otherwise throws "<label> is required". */
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

/** Wires every IPC channel the renderer uses and the oracle-to-renderer event bridges. Call once, before the window loads. */
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

/** Handles minimize, maximize (toggle) and close for the frameless window. */
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

/** Handles folder selection, project analysis, MCP status and the recent-projects list. Analysis errors come back as `{ success: false, error }`. */
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

  /**
   * Analyzes the requested project, or reloads the project that is already open when the renderer
   * sends no path. It never falls back to `process.cwd()`: in a development build that is the
   * CodeMaps repository itself, so a renderer that forgot the path would silently index CodeMaps
   * instead of the user's project.
   */
  const analyzeProject = async (projectPath: unknown) => {
    try {
      const requestedPath = projectPath || oracleStore.getState().baseDir;
      const data = await oracle.analyzeProject(requireProjectDirectory(requestedPath));
      return { success: true, data };
    } catch (error: unknown) {
      return { success: false, error: getErrorMessage(error) };
    }
  };

  ipcMain.handle('select-directory', openDirectoryDialog);
  ipcMain.handle('dialog:open-directory', openDirectoryDialog);
  ipcMain.handle('analyze-project', async (_, projectPath: unknown) => analyzeProject(projectPath));
  ipcMain.handle('mcp-status', () => getMcpStatus());
  ipcMain.handle('get-recent-projects', () => oracleStore.getState().recentProjects);
  ipcMain.handle('clear-recent-projects', () => {
    oracleStore.getState().clearRecentProjects();
  });
  ipcMain.handle('open-recent-project', async (_, projectPath: unknown) =>
    analyzeProject(projectPath)
  );
}

/** Handles the analytics channels (PR impact, heatmap, blast radius, decomposition, duplicates). Each answers with `{ success, data }` or `{ success: false, error }` and logs failures. */
function registerAnalyticsBindings(
  ipcMain: IpcMain,
  getErrorMessage: (error: unknown) => string,
  logger: LoggerLike
) {
  // Wraps an analytics action in the shared success/error envelope returned over IPC.
  const respond = async (logLabel: string, run: () => Promise<unknown> | unknown) => {
    try {
      return { success: true, data: await run() };
    } catch (error: unknown) {
      logger.error(logLabel, getErrorMessage(error));
      return { success: false, error: getErrorMessage(error) };
    }
  };

  ipcMain.handle(
    'analyze-pr-impact',
    (_, rawProjectPath: unknown, baseBranch: unknown, headBranch: unknown) =>
      respond('[PRImpact] Analysis failed:', () =>
        runPrImpact(rawProjectPath, baseBranch, headBranch)
      )
  );

  ipcMain.handle(
    'analyze-activity-heatmap',
    (_, rawProjectPath: unknown, since?: string, until?: string) =>
      respond('[Heatmap] Analysis failed:', () => runActivityHeatmap(rawProjectPath, since, until))
  );

  ipcMain.handle(
    'calculate-blast-radius',
    (_, rawProjectPath: unknown, nodeId: unknown, maxDepth?: number) =>
      respond('[BlastRadius] Calculation failed:', () =>
        runBlastRadius(rawProjectPath, nodeId, maxDepth)
      )
  );

  ipcMain.handle('analyze-decomposition', (_, rawProjectPath: unknown, focusNodeIds?: string[]) =>
    respond('[Decomposition] Analysis failed:', () =>
      runDecomposition(rawProjectPath, focusNodeIds)
    )
  );

  ipcMain.handle('find-duplicates', (_, rawProjectPath: unknown, limit?: number) =>
    respond('[Duplicates] Analysis failed:', () => runFindDuplicates(rawProjectPath, limit))
  );

  ipcMain.handle('check-documentation', (_, rawProjectPath: unknown, limit?: number) =>
    respond('[Documentation] Analysis failed:', () => runCheckDocumentation(rawProjectPath, limit))
  );
}

/** Documentation coverage of the open project for the Documentation tab (low-quality included). */
async function runCheckDocumentation(rawProjectPath: unknown, limit?: number) {
  requireProjectDirectory(rawProjectPath); // validate
  const graphData = oracleStore.getState().getValidGraph();
  const { documentationIndex, buildDocumentationToolReport } =
    await import('./analysis/documentation/index.js');
  const report = await documentationIndex.refreshFor(graphData);
  return buildDocumentationToolReport(report, {
    limit: typeof limit === 'number' ? limit : undefined,
    includeLowQuality: true,
  });
}

/** Duplicate report for the currently loaded graph. `rawProjectPath` is only validated, the analysis always uses the open project. */
async function runFindDuplicates(rawProjectPath: unknown, limit?: number) {
  requireProjectDirectory(rawProjectPath); // validate
  const graphData = oracleStore.getState().getValidGraph();
  const { cloneIndex } = await import('./analysis/clones/CloneIndex.js');
  const { buildDuplicateReport } = await import('./analysis/clones/duplicateReport.js');
  const groups = await cloneIndex.refreshFor(graphData);
  return buildDuplicateReport(graphData, groups, {
    limit: typeof limit === 'number' ? limit : undefined,
  });
}

/** Initializes `service`, runs `work` with it, then closes it. */
async function withInitializedService<
  Service extends { init(): unknown; close(): unknown },
  Result,
>(service: Service, work: (service: Service) => Result | Promise<Result>): Promise<Result> {
  await service.init();
  const result = await work(service);
  await service.close();
  return result;
}

/** Blast radius of the changes between two branches of the repository at `rawProjectPath`; all three arguments are validated first. */
async function runPrImpact(rawProjectPath: unknown, baseBranch: unknown, headBranch: unknown) {
  const projectPath = requireProjectDirectory(rawProjectPath);
  const { PRImpactAnalyzer } = await import('./services/PRImpactAnalyzer.js');
  return withInitializedService(new PRImpactAnalyzer(projectPath), (analyzer) =>
    analyzer.analyzePR(
      requireString(baseBranch, 'Base branch'),
      requireString(headBranch, 'Head branch')
    )
  );
}

/** Git churn for the repository at `rawProjectPath`, optionally limited to an ISO date range. */
async function runActivityHeatmap(rawProjectPath: unknown, since?: string, until?: string) {
  const projectPath = requireProjectDirectory(rawProjectPath);
  const { GitActivityService } = await import('./services/GitActivityService.js');
  return withInitializedService(new GitActivityService(projectPath), (service) =>
    service.analyzeChurn(since ? new Date(since) : undefined, until ? new Date(until) : undefined)
  );
}

/** Transitive impact of one node, using the repository database; traversal depth defaults to 5. */
async function runBlastRadius(rawProjectPath: unknown, nodeId: unknown, maxDepth?: number) {
  const projectPath = requireProjectDirectory(rawProjectPath);
  const { BlastRadiusV2 } = await import('./services/BlastRadiusV2.js');
  return withInitializedService(new BlastRadiusV2(projectPath), (analyzer) =>
    analyzer.calculate(requireString(nodeId, 'Node id'), maxDepth || 5)
  );
}

/** Decomposition guidance for the currently loaded graph, optionally focused on `focusNodeIds`. `rawProjectPath` is only validated. */
async function runDecomposition(rawProjectPath: unknown, focusNodeIds?: string[]) {
  requireProjectDirectory(rawProjectPath); // validate
  const { oracleStore } = await import('./store.js');
  const graphData = oracleStore.getState().getValidGraph();
  const { DecompositionGuidanceService } =
    await import('./analysis/DecompositionGuidanceService.js');
  const service = new DecompositionGuidanceService();
  return service.prepareGuidance(graphData, { focusNodeIds });
}

/** Forwards oracle progress and graph updates to the renderer, and saves each updated graph to Kuzu through a serialized writer so saves never overlap. */
function registerOracleBridges(
  getMainWindow: () => BrowserWindow | null,
  loadKuzuIntegrationCtor: () => Promise<any>,
  logger: LoggerLike,
  getErrorMessage: (error: unknown) => string
) {
  oracle.on('parsing-progress', (progress) => {
    getMainWindow()?.webContents.send('parsing-progress', progress);
  });

  const persist = createSerializedPersister((graphData) =>
    persistGraphToKuzu(graphData, loadKuzuIntegrationCtor, logger, getErrorMessage)
  );

  oracle.on('graph-updated', async (graphData) => {
    getMainWindow()?.webContents.send('graph-updated', graphData);
    await persist(graphData);
  });
}
