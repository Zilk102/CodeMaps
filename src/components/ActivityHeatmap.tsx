import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';

interface FileChurn {
  filePath: string;
  commits: number;
  additions: number;
  deletions: number;
  lastModified: string;
  authors: string[];
}

interface HeatmapData {
  files: FileChurn[];
  maxCommits: number;
  maxChanges: number;
  totalFiles: number;
  timeRange: { from: string; to: string };
}

interface ActivityHeatmapProps {
  projectPath: string;
}

export const ActivityHeatmap: React.FC<ActivityHeatmapProps> = ({ projectPath }) => {
  const { t } = useTranslation();
  const [heatmap, setHeatmap] = useState<HeatmapData | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [timeRange, setTimeRange] = useState('30');

  const loadHeatmap = async () => {
    setIsLoading(true);
    setError(null);

    try {
      const days = parseInt(timeRange);
      const since = new Date();
      since.setDate(since.getDate() - days);

      if (window.api?.analyzeActivityHeatmap) {
        const result = await window.api.analyzeActivityHeatmap(
          projectPath,
          since.toISOString(),
          new Date().toISOString()
        );

        if (result.success && result.data) {
          setHeatmap(result.data);
        } else {
          throw new Error(result.error || 'Unknown error');
        }
      } else {
        throw new Error('Activity heatmap not available');
      }
    } catch (err: unknown) {
      if (err instanceof Error) {
        setError(err.message || t('activityHeatmap.error'));
      } else {
        setError(t('activityHeatmap.error'));
      }
    } finally {
      setIsLoading(false);
    }
  };

  const getHeatColor = (commits: number, max: number) => {
    const intensity = Math.min(commits / max, 1);
    // From cool (blue) to hot (red)
    if (intensity < 0.2) return 'bg-blue-100 dark:bg-blue-900/20 text-blue-800 dark:text-blue-200';
    if (intensity < 0.4)
      return 'bg-green-100 dark:bg-green-900/20 text-green-800 dark:text-green-200';
    if (intensity < 0.6)
      return 'bg-yellow-100 dark:bg-yellow-900/20 text-yellow-800 dark:text-yellow-200';
    if (intensity < 0.8)
      return 'bg-orange-100 dark:bg-orange-900/20 text-orange-800 dark:text-orange-200';
    return 'bg-red-100 dark:bg-red-900/20 text-red-800 dark:text-red-200';
  };

  const getHeatWidth = (commits: number, max: number) => {
    return `${Math.max((commits / max) * 100, 2)}%`;
  };

  return (
    <div className="space-y-4 p-4">
      <div className="rounded-2xl border border-(--border) bg-(--bg2) p-4">
        <div className="text-[12px] font-semibold uppercase tracking-[0.12em] text-(--t3)">
          {t('tools.quickActions.hotspots')}
        </div>
        <div className="mt-2 flex flex-col gap-3 xl:flex-row xl:items-start xl:justify-between">
          <div>
            <h3 className="text-[16px] font-semibold text-(--t0)">{t('activityHeatmap.title')}</h3>
            <p className="mt-2 text-[13px] leading-6 text-(--t2)">
              {t('tools.quickActions.heatmapDescription')}
            </p>
          </div>

          <div className="flex items-center gap-2">
            <select
              value={timeRange}
              onChange={(e) => setTimeRange(e.target.value)}
              className="rounded-xl border border-(--border) bg-(--bg1) px-3 py-2 text-sm text-(--t0) outline-none transition-colors focus:border-(--acc)"
            >
              <option value="7">{t('activityHeatmap.last7days')}</option>
              <option value="30">{t('activityHeatmap.last30days')}</option>
              <option value="90">{t('activityHeatmap.last90days')}</option>
              <option value="365">{t('activityHeatmap.lastYear')}</option>
            </select>

            <button
              type="button"
              onClick={loadHeatmap}
              disabled={isLoading}
              className="rounded-xl bg-(--acc) px-4 py-2 text-sm font-semibold text-(--bg0) transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {isLoading ? t('activityHeatmap.loading') : t('activityHeatmap.analyze')}
            </button>
          </div>
        </div>
      </div>

      {error && (
        <div className="rounded-2xl border border-[rgba(255,107,107,0.35)] bg-[rgba(255,107,107,0.08)] p-4">
          <div className="text-sm text-(--red)">{error}</div>
        </div>
      )}

      {heatmap && heatmap.files.length > 0 && (
        <div className="space-y-3">
          <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
            <div className="rounded-2xl border border-(--border) bg-(--bg2) p-4">
              <div className="text-[11px] uppercase tracking-[0.08em] text-(--t3)">
                {t('activityHeatmap.filesAnalyzed')}
              </div>
              <div className="mt-2 text-[24px] font-semibold text-(--t0)">{heatmap.totalFiles}</div>
            </div>
            <div className="rounded-2xl border border-(--border) bg-(--bg2) p-4">
              <div className="text-[11px] uppercase tracking-[0.08em] text-(--t3)">
                {t('activityHeatmap.maxCommits')}
              </div>
              <div className="mt-2 text-[24px] font-semibold text-(--t0)">{heatmap.maxCommits}</div>
            </div>
            <div className="rounded-2xl border border-(--border) bg-(--bg2) p-4">
              <div className="text-[11px] uppercase tracking-[0.08em] text-(--t3)">
                {t('activityHeatmap.maxChanges')}
              </div>
              <div className="mt-2 text-[24px] font-semibold text-(--t0)">{heatmap.maxChanges}</div>
            </div>
          </div>

          <div className="rounded-2xl border border-(--border) bg-(--bg2) p-4">
            <div className="flex flex-wrap items-center gap-3 text-xs text-(--t2)">
              <span>{t('activityHeatmap.intensity')}:</span>
              <div className="flex items-center gap-1">
                <div className="h-4 w-4 rounded bg-blue-100 dark:bg-blue-900/20"></div>
                <span>{t('activityHeatmap.low')}</span>
              </div>
              <div className="flex items-center gap-1">
                <div className="h-4 w-4 rounded bg-green-100 dark:bg-green-900/20"></div>
                <span>{t('activityHeatmap.medium')}</span>
              </div>
              <div className="flex items-center gap-1">
                <div className="h-4 w-4 rounded bg-yellow-100 dark:bg-yellow-900/20"></div>
                <span>{t('activityHeatmap.high')}</span>
              </div>
              <div className="flex items-center gap-1">
                <div className="h-4 w-4 rounded bg-orange-100 dark:bg-orange-900/20"></div>
                <span>{t('activityHeatmap.veryHigh')}</span>
              </div>
              <div className="flex items-center gap-1">
                <div className="h-4 w-4 rounded bg-red-100 dark:bg-red-900/20"></div>
                <span>{t('activityHeatmap.critical')}</span>
              </div>
            </div>
          </div>

          <div className="space-y-2">
            {heatmap.files.slice(0, 50).map((file) => (
              <div
                key={file.filePath}
                className={`relative overflow-hidden rounded-2xl border border-(--border) p-3 ${getHeatColor(file.commits, heatmap.maxCommits)}`}
              >
                <div className="relative z-10">
                  <div className="flex items-center justify-between gap-3">
                    <span className="truncate text-sm font-medium" title={file.filePath}>
                      {file.filePath.split('/').pop() || file.filePath}
                    </span>
                    <div className="flex shrink-0 items-center gap-3 text-xs">
                      <span className="font-semibold">
                        {file.commits} {t('activityHeatmap.commits')}
                      </span>
                      <span className="text-green-700">+{file.additions}</span>
                      <span className="text-red-700">-{file.deletions}</span>
                    </div>
                  </div>
                  <div className="mt-1 text-xs opacity-75">{file.filePath}</div>
                  <div className="mt-1 text-xs opacity-75">
                    {file.authors.slice(0, 3).join(', ')}
                    {file.authors.length > 3 && ` +${file.authors.length - 3}`}
                  </div>
                </div>
                <div
                  className="absolute inset-y-0 left-0 opacity-20 bg-current"
                  style={{ width: getHeatWidth(file.commits, heatmap.maxCommits) }}
                />
              </div>
            ))}
          </div>

          {heatmap.files.length > 50 && (
            <div className="text-center text-sm text-(--t2)">
              {t('activityHeatmap.andMore', { count: heatmap.files.length - 50 })}
            </div>
          )}
        </div>
      )}

      {heatmap && heatmap.files.length === 0 && !isLoading && (
        <div className="rounded-2xl border border-(--border) bg-(--bg2) p-4 text-center text-(--t2)">
          {t('activityHeatmap.noData')}
        </div>
      )}
    </div>
  );
};
