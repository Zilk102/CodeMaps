import { cloneIndex } from '../analysis/clones/CloneIndex';
import { documentationIndex } from '../analysis/documentation';
import { app } from 'electron';
import { GraphData, oracleStore } from '../store';
import { oracle } from '../oracle';
import { analyzeDetachedProject } from './detachedProject';
import * as fs from 'fs';
import * as path from 'path';

// Simple concurrency limit of 1 (Mutex) to replace p-limit and avoid ESM issues
let currentPromise: Promise<unknown> = Promise.resolve();
const analyzeLimit = async <T>(fn: () => Promise<T>): Promise<T> => {
  const result = currentPromise.then(() => fn());
  currentPromise = result.catch(() => {});
  return result;
};

/** Converts backslashes to forward slashes (graph ids always use `/`); passes `undefined` through. */
export const normalizePath = (value?: string) => value?.replace(/\\/g, '/');

/** A mistyped path would otherwise index nothing and look like a successful, empty analysis. */
export const assertProjectDirectory = (resolvedPath: string, requestedPath: string) => {
  let isDirectory = false;
  try {
    isDirectory = fs.statSync(resolvedPath).isDirectory();
  } catch {
    isDirectory = false;
  }
  if (!isDirectory) {
    throw new Error(
      `Project path does not exist or is not a directory: ${requestedPath} (resolved to ${resolvedPath}). Pass an absolute path.`
    );
  }
};

/** Any absolute path is allowed; a relative one resolves from cwd (no SAFE_ROOT restriction). */
const resolveRequestedPath = (projectPath: string): string => {
  const targetPath = normalizePath(
    path.isAbsolute(projectPath) ? projectPath : path.resolve(process.cwd(), projectPath)
  )!;
  assertProjectDirectory(targetPath, projectPath);
  return targetPath;
};

/** Whether `targetPath` lies in the app's own install or resources directory, which would index CodeMaps itself instead of a project. False when the Electron `app` API is unavailable. */
const isInsideElectronInstall = (targetPath: string): boolean => {
  try {
    const exeDir = normalizePath(path.dirname(app.getPath('exe')));
    const resourcesDir = normalizePath(process.resourcesPath);
    return Boolean(
      (exeDir && targetPath.startsWith(exeDir)) ||
      (resourcesDir && targetPath.startsWith(resourcesDir))
    );
  } catch {
    // Ignore if app is not available
    return false;
  }
};

/** Prevent accidentally indexing the Electron installation directory if no project is opened. */
const resolveDefaultPath = (baseDir: string | undefined): string => {
  const targetPath = baseDir || normalizePath(process.env.CODEMAPS_ROOT || process.cwd())!;
  if (!baseDir && !process.env.CODEMAPS_ROOT && isInsideElectronInstall(targetPath)) {
    throw new Error(
      'No active project loaded in CodeMaps. Please use the analyze_project tool to specify an absolute projectPath first.'
    );
  }
  return targetPath;
};

const ANALYZE_TIMEOUT_MS = 60000;

/**
 * Runs one analysis under the shared mutex and a hard timeout, so a large project cannot block every
 * other tool call. The timer is cleared as soon as the analysis settles.
 */
const analyzeWithBudget = (analyze: () => Promise<GraphData>) =>
  analyzeLimit(async () => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const timeout = new Promise<never>((_, reject) => {
      timer = setTimeout(
        () => reject(new Error('oracle.analyzeProject timed out')),
        ANALYZE_TIMEOUT_MS
      );
    });

    try {
      return await Promise.race([analyze(), timeout]);
    } finally {
      clearTimeout(timer);
    }
  });

const resolveTargetPath = (projectPath: string | undefined, baseDir: string | undefined) =>
  projectPath ? resolveRequestedPath(projectPath) : resolveDefaultPath(baseDir);

/**
 * The absolute project directory a tool should work on: `projectPath` when given, otherwise the
 * project CodeMaps has open (or the server's working directory). Unlike `ensureGraphLoaded` it
 * does not index anything, so tools that only need files on disk stay fast. Throws for a missing
 * directory or when no project is open and the working directory is the app install.
 */
export const resolveProjectRoot = (projectPath?: string): string =>
  resolveTargetPath(projectPath, oracleStore.getState().baseDir);

/** A project must be (re)analyzed when none is open or a different one was requested. */
const needsAnalysis = (
  projectPath: string | undefined,
  baseDir: string | undefined,
  target: string
) => !baseDir || Boolean(projectPath && normalizePath(baseDir) !== target);

/**
 * Returns the graph for `projectPath`, analyzing the project first when none is open or a different one was requested; otherwise returns the current oracle graph.
 * A different project is analyzed in a private store when the app already shows one, so a tool call
 * cannot replace the user's map.
 * Throws for a missing directory, or when no project is open and the working directory is the app install. Analysis is serialized and capped at 60 seconds. The clone index is refreshed before returning.
 */
export const ensureGraphLoaded = async (projectPath?: string): Promise<GraphData> => {
  const { baseDir } = oracleStore.getState();
  const targetPath = resolveTargetPath(projectPath, baseDir);

  if (!needsAnalysis(projectPath, baseDir, targetPath)) {
    return withCloneIndex(oracle.getGraph());
  }

  const graph = baseDir
    ? await analyzeWithBudget(() => analyzeDetachedProject(targetPath))
    : await analyzeWithBudget(() => oracle.analyzeProject(targetPath));
  return withCloneIndex(graph);
};

/** Tools that report duplication or documentation read the indexes, so they must be current first. */
const withCloneIndex = async (graph: GraphData): Promise<GraphData> => {
  await Promise.all([
    cloneIndex.refreshFor(graph).catch(() => undefined),
    documentationIndex.refreshFor(graph).catch(() => undefined),
  ]);
  return graph;
};
