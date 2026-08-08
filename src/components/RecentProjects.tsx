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
    <div
      style={{
        width: '100%',
        height: '100%',
        background: 'var(--bg0)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        color: 'var(--t1)',
        fontFamily: 'var(--font-family)',
      }}
    >
      <div style={{ maxWidth: 520, width: '100%', padding: '0 24px' }}>
        <div style={{ textAlign: 'center', marginBottom: 40 }}>
          <h1
            style={{
              fontSize: 28,
              fontWeight: 700,
              margin: '0 0 8px 0',
              color: 'var(--t0)',
              letterSpacing: '-0.5px',
            }}
          >
            CodeMaps
          </h1>
          <p style={{ fontSize: 14, color: 'var(--t2)', margin: 0 }}>
            {t('recentProjects.tagline')}
          </p>
        </div>

        <div
          style={{
            background: 'var(--bg1)',
            border: '1px solid var(--border)',
            borderRadius: 12,
            overflow: 'hidden',
          }}
        >
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '14px 18px',
              borderBottom: '1px solid var(--border)',
            }}
          >
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                fontSize: 13,
                fontWeight: 600,
                color: 'var(--t0)',
              }}
            >
              <ClockIcon />
              {t('recentProjects.title')}
            </div>
            {recentProjects.length > 0 && (
              <button
                onClick={handleClearHistory}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                  fontSize: 12,
                  color: 'var(--t3)',
                  background: 'transparent',
                  border: 'none',
                  cursor: 'pointer',
                  padding: '4px 8px',
                  borderRadius: 4,
                  transition: 'color 0.15s',
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.color = 'var(--red)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.color = 'var(--t3)';
                }}
              >
                <TrashIcon />
                {t('recentProjects.clearHistory')}
              </button>
            )}
          </div>

          {recentProjects.length === 0 ? (
            <div
              style={{
                padding: '36px 24px',
                textAlign: 'center',
                color: 'var(--t3)',
                fontSize: 13,
              }}
            >
              <div style={{ marginBottom: 12, opacity: 0.5 }}>
                <FolderIcon />
              </div>
              <div>{t('recentProjects.noProjects')}</div>
            </div>
          ) : (
            <div>
              {recentProjects.map((project: RecentProject) => {
                const telemetryBadge = getTelemetryBadge(project, t);

                return (
                  <button
                    key={project.path}
                    onClick={() => handleOpenProject(project.path)}
                    disabled={isLoading}
                    style={{
                      width: '100%',
                      display: 'flex',
                      alignItems: 'flex-start',
                      gap: 12,
                      padding: '12px 18px',
                      background: 'transparent',
                      border: 'none',
                      borderBottom: '1px solid var(--border)',
                      cursor: 'pointer',
                      textAlign: 'left',
                      color: 'inherit',
                      fontFamily: 'inherit',
                      transition: 'background 0.15s',
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.background = 'var(--hover)';
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.background = 'transparent';
                    }}
                  >
                    <div
                      style={{
                        color: 'var(--acc)',
                        opacity: 0.8,
                        display: 'flex',
                        alignItems: 'center',
                        paddingTop: 2,
                      }}
                    >
                      <FolderIcon />
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: 8,
                          minWidth: 0,
                          marginBottom: 2,
                        }}
                      >
                        <div
                          style={{
                            fontSize: 13,
                            fontWeight: 500,
                            color: 'var(--t0)',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap',
                            minWidth: 0,
                          }}
                        >
                          {project.name}
                        </div>
                        {telemetryBadge && (
                          <span
                            style={{
                              flexShrink: 0,
                              fontSize: 10,
                              fontWeight: 700,
                              color: telemetryBadge.color,
                              background: telemetryBadge.background,
                              borderRadius: 999,
                              padding: '2px 7px',
                              letterSpacing: '0.02em',
                            }}
                          >
                            {telemetryBadge.label}
                          </span>
                        )}
                      </div>
                      <div
                        style={{
                          fontSize: 11,
                          color: 'var(--t3)',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                          fontFamily: 'monospace',
                          marginBottom: project.telemetry ? 6 : 0,
                        }}
                      >
                        {project.path}
                      </div>
                      {project.telemetry && (
                        <>
                          <div
                            style={{
                              fontSize: 11,
                              color: 'var(--t2)',
                              lineHeight: 1.45,
                            }}
                          >
                            {t('recentProjects.telemetry.latency')}:{' '}
                            {formatLatency(project.telemetry.avgRefreshLatencyMs)} |{' '}
                            {t('recentProjects.telemetry.skipRate')}:{' '}
                            {formatRate(project.telemetry.skipRate)} |{' '}
                            {t('recentProjects.telemetry.coalescing')}:{' '}
                            {formatRate(project.telemetry.coalescingRatio)}
                          </div>
                          <div
                            style={{
                              fontSize: 11,
                              color: 'var(--t3)',
                              lineHeight: 1.45,
                            }}
                          >
                            {t('recentProjects.telemetry.trend')}:{' '}
                            {translateTelemetryTrend(project.telemetry.latencyTrend, t)} |{' '}
                            {t('recentProjects.telemetry.batchTrend')}:{' '}
                            {translateTelemetryTrend(project.telemetry.batchSizeTrend, t)} |{' '}
                            {t('recentProjects.telemetry.runtimePriority')}:{' '}
                            {formatRate(project.telemetry.runtimePriorityRate)}
                          </div>
                        </>
                      )}
                    </div>
                    <div
                      style={{
                        fontSize: 11,
                        color: 'var(--t3)',
                        whiteSpace: 'nowrap',
                        textAlign: 'right',
                        lineHeight: 1.45,
                      }}
                    >
                      <div>{formatDate(project.lastOpened, t)}</div>
                      {project.telemetry && (
                        <div style={{ marginTop: 4 }}>
                          {t('recentProjects.telemetry.updated')}:{' '}
                          {formatDate(project.telemetry.updatedAt, t)}
                        </div>
                      )}
                    </div>
                  </button>
                );
              })}
            </div>
          )}

          <div style={{ padding: '12px 18px', borderTop: '1px solid var(--border)' }}>
            <button
              onClick={openProject}
              disabled={isLoading}
              style={{
                width: '100%',
                padding: '10px',
                background: 'var(--acc)',
                color: '#fff',
                border: 'none',
                borderRadius: 6,
                cursor: 'pointer',
                fontSize: 13,
                fontWeight: 600,
                fontFamily: 'inherit',
                transition: 'opacity 0.15s',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.opacity = '0.9';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.opacity = '1';
              }}
            >
              {isLoading ? t('recentProjects.opening') : t('recentProjects.openFolder')}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
