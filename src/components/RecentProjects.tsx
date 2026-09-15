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
    <div className="flex h-full w-full items-start justify-center overflow-auto bg-(--bg0) px-6 pt-24 pb-24 text-(--t1)">
      <div className="flex w-full max-w-[800px] flex-col gap-8 relative z-10">
        {/* Welcome Section */}
        <div className="flex items-end justify-between border-b border-(--border2) pb-5">
          <div>
            <h1 className="text-[28px] font-semibold tracking-tight text-(--t0)">CodeMaps</h1>
            <p className="mt-1.5 text-[14px] text-(--t2)">{t('recentProjects.tagline')}</p>
          </div>
          <button
            onClick={openProject}
            disabled={isLoading}
            className="btn-primary flex items-center gap-2 rounded-md px-4 py-2 text-[13px] font-medium shadow-sm transition-transform active:scale-95"
          >
            <FolderIcon />
            {isLoading ? t('recentProjects.opening') : t('recentProjects.openFolder')}
          </button>
        </div>

        {/* Project List */}
        <div className="flex flex-col">
          <div className="mb-4 flex items-center justify-between text-[12px] font-semibold uppercase tracking-wider text-(--t3)">
            <div className="flex items-center gap-2">
              <ClockIcon />
              {t('recentProjects.title')}
            </div>
            {recentProjects.length > 0 && (
              <button
                onClick={handleClearHistory}
                className="text-(--t3) hover:text-(--red) transition-colors"
              >
                {t('recentProjects.clearHistory')}
              </button>
            )}
          </div>

          {recentProjects.length === 0 ? (
            <div className="surface-card flex h-[240px] flex-col items-center justify-center gap-4 text-(--t3)">
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-(--bg2) text-(--t2)">
                <FolderIcon />
              </div>
              <div className="text-[14px] font-medium text-(--t2)">
                {t('recentProjects.noProjects')}
              </div>
            </div>
          ) : (
            <div className="flex flex-col gap-2">
              {recentProjects.map((project: RecentProject) => {
                const telemetryBadge = getTelemetryBadge(project, t);

                return (
                  <button
                    key={project.path}
                    onClick={() => handleOpenProject(project.path)}
                    disabled={isLoading}
                    className="group flex w-full flex-col gap-2 rounded-lg border border-(--border) bg-(--bg1) p-4 text-left transition-all duration-200 hover:border-(--acc) hover:bg-(--hover) hover:shadow-md hover:-translate-y-0.5"
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className="text-[15px] font-semibold text-(--t0) group-hover:text-(--acc) transition-colors">
                          {project.name}
                        </div>
                        {telemetryBadge && (
                          <div
                            className="rounded-sm px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide"
                            style={{
                              color: telemetryBadge.color,
                              background: telemetryBadge.background,
                            }}
                          >
                            {telemetryBadge.label}
                          </div>
                        )}
                      </div>
                      <div className="text-[12px] text-(--t3)">
                        {formatDate(project.lastOpened, t)}
                      </div>
                    </div>

                    <div className="truncate text-[12px] text-(--t3) font-mono">{project.path}</div>

                    {project.telemetry && (
                      <div className="mt-1 flex items-center gap-4 text-[11px]">
                        <div className="flex items-center gap-1.5">
                          <span className="text-(--t3)">
                            {t('recentProjects.telemetry.latency')}:
                          </span>
                          <span className="font-mono text-(--t2)">
                            {formatLatency(project.telemetry.avgRefreshLatencyMs)}
                          </span>
                        </div>
                        <div className="flex items-center gap-1.5">
                          <span className="text-(--t3)">
                            {t('recentProjects.telemetry.skipRate')}:
                          </span>
                          <span className="font-mono text-(--t2)">
                            {formatRate(project.telemetry.skipRate)}
                          </span>
                        </div>
                        <div className="flex items-center gap-1.5">
                          <span className="text-(--t3)">
                            {t('recentProjects.telemetry.trend')}:
                          </span>
                          <span className="text-(--t2)">
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
