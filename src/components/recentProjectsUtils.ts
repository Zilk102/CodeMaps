import type { RecentProject } from '../types/electron';

export type Translate = (key: string, options?: Record<string, unknown>) => string;

export function formatDate(isoString: string, t: Translate): string {
  const date = new Date(isoString);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return t('recentProjects.relative.justNow');
  if (diffMins < 60) return t('recentProjects.relative.minutesAgo', { count: diffMins });
  if (diffHours < 24) return t('recentProjects.relative.hoursAgo', { count: diffHours });
  if (diffDays < 7) return t('recentProjects.relative.daysAgo', { count: diffDays });

  return date.toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

export function getTelemetryBadge(project: RecentProject, t: Translate) {
  if (!project.telemetry) {
    return null;
  }

  return {
    label: project.telemetry.degraded
      ? t('recentProjects.telemetry.statusDegraded')
      : t('recentProjects.telemetry.statusStable'),
    color: project.telemetry.degraded ? 'var(--red)' : 'var(--acc)',
    background: project.telemetry.degraded ? 'rgba(238, 0, 0, 0.1)' : 'rgba(0, 255, 157, 0.12)',
  };
}
