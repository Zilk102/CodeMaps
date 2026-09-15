import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useConnectionStore } from '../store/useStore';
import type { RecentProject } from '../types/electron';

const ClockIcon = () => (
  <svg
    width="14"
    height="14"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <circle cx="12" cy="12" r="10" />
    <polyline points="12 6 12 12 16 14" />
  </svg>
);

const FolderIcon = () => (
  <svg
    width="16"
    height="16"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
  </svg>
);

const TrashIcon = () => (
  <svg
    width="14"
    height="14"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <polyline points="3 6 5 6 21 6" />
    <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
  </svg>
);

function formatDate(
  isoString: string,
  t: (key: string, options?: Record<string, unknown>) => string
): string {
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

function formatRate(value: number): string {
  return `${Math.round(value * 100)}%`;
}

function formatLatency(value: number): string {
  return `${value.toFixed(1)} ms`;
}

function translateTelemetryTrend(
  trend: 'stable' | 'improving' | 'degrading',
  t: (key: string, options?: Record<string, unknown>) => string
) {
  return t(`recentProjects.telemetry.trends.${trend}`);
}

function getTelemetryBadge(
  project: RecentProject,
  t: (key: string, options?: Record<string, unknown>) => string
) {
  if (!project.telemetry) {
    return null;
  }

  return {
    label: project.telemetry.degraded
      ? t('recentProjects.telemetry.statusDegraded')
      : t('recentProjects.telemetry.statusStable'),
    color: project.telemetry.degraded ? 'var(--red)' : 'var(--acc)',
    background: project.telemetry.degraded ? 'rgba(255, 92, 92, 0.12)' : 'rgba(68, 170, 255, 0.12)',
  };
}

export const RecentProjects: React.FC = () => {
  const { t } = useTranslation();
  const { fetchGraph, openProject } = useConnectionStore();
  const [recentProjects, setRecentProjects] = useState<RecentProject[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    let isMounted = true;
    const loadRecent = async () => {
      try {
        const projects = await window.api.getRecentProjects();
        if (isMounted) setRecentProjects(projects || []);
      } catch {
        if (isMounted) setRecentProjects([]);
      }
    };
    loadRecent();
    return () => {
      isMounted = false;
    };
  }, []);

  const handleOpenProject = async (projectPath: string) => {
    setIsLoading(true);
    try {
      await fetchGraph(projectPath);
    } catch (error) {
      console.error('Failed to open recent project:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleClearHistory = async () => {
    try {
      await window.api.clearRecentProjects();
      setRecentProjects([]);
    } catch (error: unknown) {
      console.error('Failed to clear history:', error);
    }
  };

  return (
    <div className="flex h-full w-full items-center justify-center bg-(--bg0) px-6 py-10 text-(--t1)">
      <div className="grid w-full max-w-[1180px] gap-6 xl:grid-cols-[0.95fr_1.35fr]">
        <div className="surface-card flex flex-col justify-between gap-6 p-7">
          <div>
            <div className="section-label">{t('recentProjects.title')}</div>
            <h1 className="mt-3 text-[34px] font-bold tracking-[-0.04em] text-(--t0)">CodeMaps</h1>
            <p className="mt-3 max-w-[420px] text-[14px] leading-6 text-(--t2)">
              {t('recentProjects.tagline')}
            </p>
          </div>

          <div className="grid gap-3 sm:grid-cols-3">
            <div className="rounded-2xl border border-(--border) bg-(--bg2) p-4">
              <div className="section-label">{t('recentProjects.statRecent')}</div>
              <div className="mt-2 text-[22px] font-semibold text-(--t0)">
                {recentProjects.length}
              </div>
            </div>
            <div className="rounded-2xl border border-(--border) bg-(--bg2) p-4">
              <div className="section-label">{t('recentProjects.statStatus')}</div>
              <div className="mt-2 text-[14px] font-semibold text-(--t0)">
                {isLoading ? t('recentProjects.opening') : t('recentProjects.ready')}
              </div>
            </div>
            <div className="rounded-2xl border border-(--border) bg-(--bg2) p-4">
              <div className="section-label">{t('recentProjects.statEntry')}</div>
              <div className="mt-2 text-[14px] font-semibold text-(--t0)">
                {t('recentProjects.openFolder')}
              </div>
            </div>
          </div>

          <button
            onClick={openProject}
            disabled={isLoading}
            className="btn-glass btn-primary w-full justify-center text-[13px]"
          >
            {isLoading ? t('recentProjects.opening') : t('recentProjects.openFolder')}
          </button>
        </div>

        <div className="surface-card overflow-hidden">
          <div className="flex items-center justify-between gap-3 border-b border-(--border) px-5 py-4">
            <div className="flex items-center gap-2 text-[13px] font-semibold text-(--t0)">
              <ClockIcon />
              {t('recentProjects.title')}
            </div>
            {recentProjects.length > 0 && (
              <button onClick={handleClearHistory} className="btn-glass btn-danger">
                <TrashIcon />
                {t('recentProjects.clearHistory')}
              </button>
            )}
          </div>

          {recentProjects.length === 0 ? (
            <div className="flex min-h-[360px] flex-col items-center justify-center gap-4 px-6 text-center">
              <div className="flex h-14 w-14 items-center justify-center rounded-2xl border border-(--border) bg-(--bg2) text-(--acc)">
                <FolderIcon />
              </div>
              <div className="text-[14px] text-(--t2)">{t('recentProjects.noProjects')}</div>
              <button onClick={openProject} disabled={isLoading} className="btn-glass btn-primary">
                {isLoading ? t('recentProjects.opening') : t('recentProjects.openFolder')}
              </button>
            </div>
          ) : (
            <div className="max-h-[560px] overflow-y-auto p-3">
              <div className="grid gap-3">
                {recentProjects.map((project: RecentProject) => {
                  const telemetryBadge = getTelemetryBadge(project, t);

                  return (
                    <button
                      key={project.path}
                      onClick={() => handleOpenProject(project.path)}
                      disabled={isLoading}
                      className="group rounded-2xl border border-(--border) bg-(--bg2)/82 p-4 text-left transition-all hover:border-(--acc) hover:bg-[rgba(255,255,255,0.035)]"
                    >
                      <div className="flex items-start gap-3">
                        <div className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-(--border) bg-(--bg1) text-(--acc)">
                          <FolderIcon />
                        </div>

                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <div className="truncate text-[14px] font-semibold text-(--t0)">
                              {project.name}
                            </div>
                            {telemetryBadge && (
                              <span
                                className="rounded-full px-2.5 py-1 text-[10px] font-bold tracking-[0.04em]"
                                style={{
                                  color: telemetryBadge.color,
                                  background: telemetryBadge.background,
                                }}
                              >
                                {telemetryBadge.label}
                              </span>
                            )}
                          </div>

                          <div className="mt-2 break-all text-[11px] leading-5 text-(--t3)">
                            {project.path}
                          </div>

                          {project.telemetry && (
                            <div className="mt-3 grid gap-2 sm:grid-cols-3">
                              <div className="rounded-xl border border-(--border) bg-(--bg1) px-3 py-2">
                                <div className="section-label">
                                  {t('recentProjects.telemetry.latency')}
                                </div>
                                <div className="mt-1 text-[12px] text-(--t1)">
                                  {formatLatency(project.telemetry.avgRefreshLatencyMs)}
                                </div>
                              </div>
                              <div className="rounded-xl border border-(--border) bg-(--bg1) px-3 py-2">
                                <div className="section-label">
                                  {t('recentProjects.telemetry.skipRate')}
                                </div>
                                <div className="mt-1 text-[12px] text-(--t1)">
                                  {formatRate(project.telemetry.skipRate)}
                                </div>
                              </div>
                              <div className="rounded-xl border border-(--border) bg-(--bg1) px-3 py-2">
                                <div className="section-label">
                                  {t('recentProjects.telemetry.coalescing')}
                                </div>
                                <div className="mt-1 text-[12px] text-(--t1)">
                                  {formatRate(project.telemetry.coalescingRatio)}
                                </div>
                              </div>
                            </div>
                          )}
                        </div>

                        <div className="shrink-0 text-right text-[11px] leading-5 text-(--t3)">
                          <div>{formatDate(project.lastOpened, t)}</div>
                          {project.telemetry && (
                            <div className="mt-2">
                              {t('recentProjects.telemetry.updated')}:{' '}
                              {formatDate(project.telemetry.updatedAt, t)}
                            </div>
                          )}
                          {project.telemetry && (
                            <div className="mt-2 text-(--t2)">
                              {t('recentProjects.telemetry.trend')}:{' '}
                              {translateTelemetryTrend(project.telemetry.latencyTrend, t)}
                            </div>
                          )}
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
