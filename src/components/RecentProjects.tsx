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
    background: project.telemetry.degraded ? 'rgba(238, 0, 0, 0.1)' : 'rgba(0, 255, 157, 0.12)',
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
    <div className="flex h-full w-full items-start justify-center overflow-auto bg-(--bg0) px-6 py-12 text-(--t1)">
      <div className="grid w-full max-w-[960px] gap-6 xl:grid-cols-[1fr_1.5fr]">
        {/* Left Column: Welcome & Stats */}
        <div className="flex flex-col gap-6">
          <div className="surface-card p-6 flex flex-col gap-4">
            <div>
              <div className="section-label mb-2">{t('recentProjects.title')}</div>
              <h1 className="text-[32px] font-bold tracking-tight text-(--t0) leading-tight">
                CodeMaps
              </h1>
              <p className="mt-2 text-[14px] leading-relaxed text-(--t2)">
                {t('recentProjects.tagline')}
              </p>
            </div>
            <button
              onClick={openProject}
              disabled={isLoading}
              className="btn-primary w-full justify-center py-2.5 text-[14px] rounded-md font-medium"
            >
              {isLoading ? t('recentProjects.opening') : t('recentProjects.openFolder')}
            </button>
          </div>

          <div className="surface-card p-6">
            <div className="grid gap-4">
              <div className="flex justify-between items-center border-b border-(--border) pb-3">
                <div className="text-[13px] text-(--t2)">{t('recentProjects.statRecent')}</div>
                <div className="text-[14px] font-semibold text-(--t0)">{recentProjects.length}</div>
              </div>
              <div className="flex justify-between items-center border-b border-(--border) pb-3">
                <div className="text-[13px] text-(--t2)">{t('recentProjects.statStatus')}</div>
                <div className="text-[14px] font-semibold text-(--t0)">
                  {isLoading ? t('recentProjects.opening') : t('recentProjects.ready')}
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Right Column: Project List */}
        <div className="surface-card flex flex-col overflow-hidden">
          <div className="flex items-center justify-between border-b border-(--border) px-6 py-4 bg-(--bg2)">
            <div className="flex items-center gap-2 text-[14px] font-medium text-(--t0)">
              <ClockIcon />
              {t('recentProjects.title')}
            </div>
            {recentProjects.length > 0 && (
              <button onClick={handleClearHistory} className="btn-glass btn-danger text-[12px]">
                <TrashIcon />
                {t('recentProjects.clearHistory')}
              </button>
            )}
          </div>

          {recentProjects.length === 0 ? (
            <div className="flex min-h-[400px] flex-col items-center justify-center gap-4 px-6 text-center">
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-(--bg2) text-(--t3)">
                <FolderIcon />
              </div>
              <div className="text-[13px] text-(--t2)">{t('recentProjects.noProjects')}</div>
            </div>
          ) : (
            <div className="max-h-[600px] overflow-y-auto p-4 flex flex-col gap-2">
              {recentProjects.map((project: RecentProject) => {
                const telemetryBadge = getTelemetryBadge(project, t);

                return (
                  <button
                    key={project.path}
                    onClick={() => handleOpenProject(project.path)}
                    disabled={isLoading}
                    className="group flex flex-col gap-3 rounded-lg border border-transparent bg-(--bg0) p-4 text-left transition-colors hover:border-(--border) hover:bg-(--bg2)"
                  >
                    <div className="flex items-start justify-between w-full">
                      <div className="flex items-center gap-3">
                        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded bg-(--bg2) text-(--acc) group-hover:bg-(--accbg)">
                          <FolderIcon />
                        </div>
                        <div>
                          <div className="flex items-center gap-2">
                            <div className="text-[14px] font-semibold text-(--t0)">
                              {project.name}
                            </div>
                            {telemetryBadge && (
                              <span
                                className="rounded px-2 py-0.5 text-[10px] font-bold"
                                style={{
                                  color: telemetryBadge.color,
                                  background: telemetryBadge.background,
                                }}
                              >
                                {telemetryBadge.label}
                              </span>
                            )}
                          </div>
                          <div className="mt-0.5 text-[12px] text-(--t3) truncate max-w-[300px]">
                            {project.path}
                          </div>
                        </div>
                      </div>
                      <div className="text-[12px] text-(--t3)">
                        {formatDate(project.lastOpened, t)}
                      </div>
                    </div>

                    {project.telemetry && (
                      <div className="flex items-center gap-6 mt-1 text-[12px]">
                        <div className="flex items-center gap-1.5">
                          <span className="text-(--t3)">
                            {t('recentProjects.telemetry.latency')}:
                          </span>
                          <span className="text-(--t1) font-medium">
                            {formatLatency(project.telemetry.avgRefreshLatencyMs)}
                          </span>
                        </div>
                        <div className="flex items-center gap-1.5">
                          <span className="text-(--t3)">
                            {t('recentProjects.telemetry.skipRate')}:
                          </span>
                          <span className="text-(--t1) font-medium">
                            {formatRate(project.telemetry.skipRate)}
                          </span>
                        </div>
                        <div className="flex items-center gap-1.5">
                          <span className="text-(--t3)">
                            {t('recentProjects.telemetry.trend')}:
                          </span>
                          <span className="text-(--t1) font-medium">
                            {translateTelemetryTrend(project.telemetry.latencyTrend, t)}
                          </span>
                        </div>
                      </div>
                    )}
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
