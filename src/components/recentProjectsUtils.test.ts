import { describe, expect, it } from 'vitest';
import type { RecentProject } from '../types/electron';
import { formatDate, getTelemetryBadge } from './recentProjectsUtils';

const t = (key: string, options?: Record<string, unknown>) =>
  options?.count !== undefined ? `${key}:${options.count}` : key;
const ago = (ms: number) => new Date(Date.now() - ms).toISOString();

describe('recentProjectsUtils', () => {
  it('formats relative dates', () => {
    expect(formatDate(ago(1000), t)).toBe('recentProjects.relative.justNow');
    expect(formatDate(ago(5 * 60000 + 500), t)).toBe('recentProjects.relative.minutesAgo:5');
    expect(formatDate(ago(3 * 3600000 + 500), t)).toBe('recentProjects.relative.hoursAgo:3');
    expect(formatDate(ago(2 * 86400000 + 500), t)).toBe('recentProjects.relative.daysAgo:2');
    expect(formatDate(ago(30 * 86400000), t)).not.toContain('recentProjects');
  });

  it('builds telemetry badges', () => {
    const base = { name: 'n', path: 'p', lastOpened: '' } as unknown as RecentProject;
    expect(getTelemetryBadge(base, t)).toBeNull();
    const degraded = { ...base, telemetry: { degraded: true } } as unknown as RecentProject;
    expect(getTelemetryBadge(degraded, t)?.color).toBe('var(--red)');
    const stable = { ...base, telemetry: { degraded: false } } as unknown as RecentProject;
    expect(getTelemetryBadge(stable, t)?.label).toBe('recentProjects.telemetry.statusStable');
  });
});
