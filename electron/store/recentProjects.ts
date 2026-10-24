/** Loading, validating and saving the recent-projects list in the user data directory. */

import log from 'electron-log/main';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { app } from 'electron';
import {
  RecentProject,
  RecentProjectTelemetrySnapshot,
  RefreshMode,
  RefreshReason,
  TrendState,
} from './types';

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null;

const asFiniteNumber = (value: unknown, fallback = 0) =>
  typeof value === 'number' && Number.isFinite(value) ? value : fallback;

const asBoolean = (value: unknown, fallback = false) =>
  typeof value === 'boolean' ? value : fallback;

const asString = (value: unknown, fallback = '') => (typeof value === 'string' ? value : fallback);

const asTrendState = (value: unknown): TrendState =>
  value === 'improving' || value === 'degrading' ? value : 'stable';

const asRefreshMode = (value: unknown): RefreshMode | null =>
  value === 'skipped' || value === 'rebuilt' ? value : null;

const asRefreshReason = (value: unknown): RefreshReason | null =>
  value === 'no_stack_impact' ||
  value === 'directory_structure_changed' ||
  value === 'stack_runtime_path_changed'
    ? value
    : null;

/** Electron's userData directory, or a per-user fallback when Electron is unavailable (tests, plain Node). */
function getUserDataDir(): string {
  try {
    if (typeof app?.getPath === 'function') {
      return app.getPath('userData');
    }
  } catch {
    // Fallback when Electron app context is unavailable.
  }
  return process.env.LOCALAPPDATA || process.env.APPDATA || path.join(os.homedir(), '.codemaps');
}

function getRecentProjectsFile(): string {
  return path.join(getUserDataDir(), 'codemaps-recent-projects.json');
}

/** Uses forward slashes so the same folder is always spelled one way. */
export const normalizeProjectPath = (projectPath: string) => projectPath.replace(/\\/g, '/');

/** Identity of a project: Windows paths differ only by drive-letter or folder case. */
export const projectPathKey = (projectPath: string) =>
  normalizeProjectPath(projectPath).toLowerCase();

/** Collapses entries that point at the same folder, keeping the most recently opened one. */
export const dedupeRecentProjects = (projects: RecentProject[]): RecentProject[] => {
  const seen = new Set<string>();
  return [...projects]
    .sort((a, b) => b.lastOpened.localeCompare(a.lastOpened))
    .filter((project) => {
      const key = projectPathKey(project.path);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
};

/** Rebuilds a stored telemetry snapshot field by field, replacing wrong or missing values with defaults. Returns undefined if the value is not an object. */
const normalizeRecentProjectTelemetry = (
  value: unknown
): RecentProjectTelemetrySnapshot | undefined => {
  if (!isRecord(value)) {
    return undefined;
  }

  return {
    updatedAt: asString(value.updatedAt, new Date(0).toISOString()),
    degraded: asBoolean(value.degraded),
    avgRefreshLatencyMs: asFiniteNumber(value.avgRefreshLatencyMs),
    skipRate: asFiniteNumber(value.skipRate),
    coalescingRatio: asFiniteNumber(value.coalescingRatio),
    runtimePriorityRate: asFiniteNumber(value.runtimePriorityRate),
    latencyTrend: asTrendState(value.latencyTrend),
    batchSizeTrend: asTrendState(value.batchSizeTrend),
    maxBatchSize: asFiniteNumber(value.maxBatchSize),
    lastBatchSize: asFiniteNumber(value.lastBatchSize),
    lastRefreshMode: asRefreshMode(value.lastRefreshMode),
    lastRefreshReason: asRefreshReason(value.lastRefreshReason),
  };
};

/** Validates one stored entry read from disk. Returns null when path, name or lastOpened is missing. */
const normalizeRecentProject = (value: unknown): RecentProject | null => {
  if (!isRecord(value)) {
    return null;
  }

  const projectPath = asString(value.path);
  const projectName = asString(value.name);
  const lastOpened = asString(value.lastOpened);

  if (!projectPath || !projectName || !lastOpened) {
    return null;
  }

  return {
    path: normalizeProjectPath(projectPath),
    name: projectName,
    lastOpened,
    telemetry: normalizeRecentProjectTelemetry(value.telemetry),
  };
};

/** Reads the list from disk, dropping invalid entries and duplicates and keeping the 10 most recent. A missing or corrupt file yields an empty list. */
export function loadRecentProjects(): RecentProject[] {
  try {
    const data = fs.readFileSync(getRecentProjectsFile(), 'utf-8');
    const parsed = JSON.parse(data) as unknown;
    if (Array.isArray(parsed)) {
      return dedupeRecentProjects(
        parsed
          .map((project) => normalizeRecentProject(project))
          .filter((project): project is RecentProject => project !== null)
      ).slice(0, 10);
    }
  } catch {
    // File doesn't exist or is corrupt.
  }
  return [];
}

/** Writes the list to disk as JSON. Failures are logged and swallowed, since losing the list is not worth interrupting the user. */
export function saveRecentProjects(projects: RecentProject[]) {
  try {
    const file = getRecentProjectsFile();
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, JSON.stringify(projects, null, 2));
  } catch (err) {
    log.error('[RecentProjects] Failed to save:', err);
  }
}
