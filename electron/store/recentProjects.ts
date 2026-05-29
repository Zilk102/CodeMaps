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

export const normalizeProjectPath = (projectPath: string) => projectPath.replace(/\\/g, '/');

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

export function loadRecentProjects(): RecentProject[] {
  try {
    const data = fs.readFileSync(getRecentProjectsFile(), 'utf-8');
    const parsed = JSON.parse(data) as unknown;
    if (Array.isArray(parsed)) {
      return parsed
        .map((project) => normalizeRecentProject(project))
        .filter((project): project is RecentProject => project !== null)
        .slice(0, 10);
    }
  } catch {
    // File doesn't exist or is corrupt.
  }
  return [];
}

export function saveRecentProjects(projects: RecentProject[]) {
  try {
    const file = getRecentProjectsFile();
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, JSON.stringify(projects, null, 2));
  } catch (err) {
    log.error('[RecentProjects] Failed to save:', err);
  }
}
