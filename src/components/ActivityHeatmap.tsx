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
    if (intensity < 0.4) return 'bg-green-100 dark:bg-green-900/20 text-green-800 dark:text-green-200';
    if (intensity < 0.6) return 'bg-yellow-100 dark:bg-yellow-900/20 text-yellow-800 dark:text-yellow-200';
    if (intensity < 0.8) return 'bg-orange-100 dark:bg-orange-900/20 text-orange-800 dark:text-orange-200';
    return 'bg-red-100 dark:bg-red-900/20 text-red-800 dark:text-red-200';
  };

  const getHeatWidth = (commits: number, max: number) => {
    return `${Math.max((commits / max) * 100, 2)}%`;
  };

  return (
    <div className="space-y-4 p-4">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-medium text-gray-900 dark:text-white">
          {t('activityHeatmap.title')}
        </h3>
        
        <div className="flex items-center gap-2">
          <select
            value={timeRange}
            onChange={(e) => setTimeRange(e.target.value)}
            className="text-sm border border-gray-300 dark:border-gray-600 rounded-md px-2 py-1 bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
          >
            <option value="7">{t('activityHeatmap.last7days')}</option>
            <option value="30">{t('activityHeatmap.last30days')}</option>
            <option value="90">{t('activityHeatmap.last90days')}</option>
            <option value="365">{t('activityHeatmap.lastYear')}</option>
          </select>
          
          <button
            onClick={loadHeatmap}
            disabled={isLoading}
            className="inline-flex items-center px-3 py-1.5 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50"
          >
            {isLoading ? t('activityHeatmap.loading') : t('activityHeatmap.analyze')}
          </button>
        </div>
      </div>

      {error && (
        <div className="rounded-md bg-red-50 dark:bg-red-900/20 p-4">
          <div className="text-sm text-red-800 dark:text-red-200">{error}</div>
        </div>
      )}

      {heatmap && heatmap.files.length > 0 && (
        <div className="space-y-3">
          {/* Stats */}
          <div className="grid grid-cols-3 gap-4 mb-4">
            <div className="bg-gray-50 dark:bg-gray-800 rounded-lg p-3">
              <div className="text-2xl font-bold text-gray-900 dark:text-white">{heatmap.totalFiles}</div>
              <div className="text-xs text-gray-500 dark:text-gray-400">{t('activityHeatmap.filesAnalyzed')}</div>
            </div>
            <div className="bg-gray-50 dark:bg-gray-800 rounded-lg p-3">
              <div className="text-2xl font-bold text-gray-900 dark:text-white">{heatmap.maxCommits}</div>
              <div className="text-xs text-gray-500 dark:text-gray-400">{t('activityHeatmap.maxCommits')}</div>
            </div>
            <div className="bg-gray-50 dark:bg-gray-800 rounded-lg p-3">
              <div className="text-2xl font-bold text-gray-900 dark:text-white">{heatmap.maxChanges}</div>
              <div className="text-xs text-gray-500 dark:text-gray-400">{t('activityHeatmap.maxChanges')}</div>
            </div>
          </div>

          {/* Legend */}
          <div className="flex items-center gap-3 text-xs text-gray-600 dark:text-gray-400">
            <span>{t('activityHeatmap.intensity')}:</span>
            <div className="flex items-center gap-1">
              <div className="w-4 h-4 rounded bg-blue-100 dark:bg-blue-900/20"></div>
              <span>{t('activityHeatmap.low')}</span>
            </div>
            <div className="flex items-center gap-1">
              <div className="w-4 h-4 rounded bg-green-100 dark:bg-green-900/20"></div>
              <span>{t('activityHeatmap.medium')}</span>
            </div>
            <div className="flex items-center gap-1">
              <div className="w-4 h-4 rounded bg-yellow-100 dark:bg-yellow-900/20"></div>
              <span>{t('activityHeatmap.high')}</span>
            </div>
            <div className="flex items-center gap-1">
              <div className="w-4 h-4 rounded bg-orange-100 dark:bg-orange-900/20"></div>
              <span>{t('activityHeatmap.veryHigh')}</span>
            </div>
            <div className="flex items-center gap-1">
              <div className="w-4 h-4 rounded bg-red-100 dark:bg-red-900/20"></div>
              <span>{t('activityHeatmap.critical')}</span>
            </div>
          </div>

          {/* Files list */}
          <div className="space-y-2 max-h-96 overflow-y-auto">
            {heatmap.files.slice(0, 50).map((file, index) => (
              <div
                key={index}
                className={`relative rounded-lg p-3 ${getHeatColor(file.commits, heatmap.maxCommits)}`}
              >
                <div className="relative z-10">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium truncate flex-1" title={file.filePath}>
                      {file.filePath.split('/').pop() || file.filePath}
                    </span>
                    <div className="flex items-center gap-3 text-xs">
                      <span className="font-semibold">{file.commits} {t('activityHeatmap.commits')}</span>
                      <span className="text-green-600">+{file.additions}</span>
                      <span className="text-red-600">-{file.deletions}</span>
                    </div>
                  </div>
                  <div className="text-xs mt-1 opacity-75">
                    {file.authors.slice(0, 3).join(', ')}
                    {file.authors.length > 3 && ` +${file.authors.length - 3}`}
                  </div>
                </div>
                <div
                  className="absolute inset-0 rounded-lg opacity-20 bg-current"
                  style={{ width: getHeatWidth(file.commits, heatmap.maxCommits) }}
                />
              </div>
            ))}
          </div>

          {heatmap.files.length > 50 && (
            <div className="text-center text-sm text-gray-500">
              {t('activityHeatmap.andMore', { count: heatmap.files.length - 50 })}
            </div>
          )}
        </div>
      )}

      {heatmap && heatmap.files.length === 0 && !isLoading && (
        <div className="text-center text-gray-500 dark:text-gray-400">
          {t('activityHeatmap.noData')}
        </div>
      )}
    </div>
  );
};
