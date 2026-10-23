import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useAnalysisRunner } from '../hooks/useAnalysisRunner';
import { ErrorBanner, PanelCard, StatTile } from './panels/PanelParts';
import {
  HEAT_LEGEND,
  MAX_VISIBLE_FILES,
  computeSince,
  fileBaseName,
  getHeatColor,
  getHeatWidth,
  summarizeAuthors,
  type FileChurn,
  type HeatmapData,
} from './panels/heatmapUtils';
import { unwrapResponse } from './panels/panelUtils';

interface ActivityHeatmapProps {
  projectPath: string;
}

const HeatmapControls: React.FC<{
  timeRange: string;
  onTimeRangeChange: (value: string) => void;
  isLoading: boolean;
  onAnalyze: () => void;
}> = ({ timeRange, onTimeRangeChange, isLoading, onAnalyze }) => {
  const { t } = useTranslation();
  return (
    <div className="flex items-center gap-2">
      <select
        value={timeRange}
        onChange={(e) => onTimeRangeChange(e.target.value)}
        className="rounded-xl border border-(--border) bg-(--bg1) px-3 py-2 text-sm text-(--t0) outline-none transition-colors focus:border-(--acc)"
      >
        <option value="7">{t('activityHeatmap.last7days')}</option>
        <option value="30">{t('activityHeatmap.last30days')}</option>
        <option value="90">{t('activityHeatmap.last90days')}</option>
        <option value="365">{t('activityHeatmap.lastYear')}</option>
      </select>

      <button
        type="button"
        onClick={onAnalyze}
        disabled={isLoading}
        className="rounded-xl bg-(--acc) px-4 py-2 text-sm font-semibold text-(--bg0) transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {isLoading ? t('activityHeatmap.loading') : t('activityHeatmap.analyze')}
      </button>
    </div>
  );
};

const HeatLegend: React.FC = () => {
  const { t } = useTranslation();
  return (
    <PanelCard className="p-4">
      <div className="flex flex-wrap items-center gap-3 text-xs text-(--t2)">
        <span>{t('activityHeatmap.intensity')}:</span>
        {HEAT_LEGEND.map(({ key, swatch }) => (
          <div key={key} className="flex items-center gap-1">
            <div className={`h-4 w-4 rounded ${swatch}`}></div>
            <span>{t(`activityHeatmap.${key}`)}</span>
          </div>
        ))}
      </div>
    </PanelCard>
  );
};

const FileHeatRow: React.FC<{ file: FileChurn; maxCommits: number }> = ({ file, maxCommits }) => {
  const { t } = useTranslation();
  return (
    <div
      className={`relative overflow-hidden rounded-2xl border border-(--border) p-3 ${getHeatColor(file.commits, maxCommits)}`}
    >
      <div className="relative z-10">
        <div className="flex items-center justify-between gap-3">
          <span className="truncate text-sm font-medium" title={file.filePath}>
            {fileBaseName(file.filePath)}
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
        <div className="mt-1 text-xs opacity-75">{summarizeAuthors(file.authors)}</div>
      </div>
      <div
        className="absolute inset-y-0 left-0 opacity-20 bg-current"
        style={{ width: getHeatWidth(file.commits, maxCommits) }}
      />
    </div>
  );
};

const HeatmapResults: React.FC<{ heatmap: HeatmapData }> = ({ heatmap }) => {
  const { t } = useTranslation();
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
        <StatTile label={t('activityHeatmap.filesAnalyzed')} value={heatmap.totalFiles} />
        <StatTile label={t('activityHeatmap.maxCommits')} value={heatmap.maxCommits} />
        <StatTile label={t('activityHeatmap.maxChanges')} value={heatmap.maxChanges} />
      </div>

      <HeatLegend />

      <div className="space-y-2">
        {heatmap.files.slice(0, MAX_VISIBLE_FILES).map((file) => (
          <FileHeatRow key={file.filePath} file={file} maxCommits={heatmap.maxCommits} />
        ))}
      </div>

      {heatmap.files.length > MAX_VISIBLE_FILES && (
        <div className="text-center text-sm text-(--t2)">
          {t('activityHeatmap.andMore', { count: heatmap.files.length - MAX_VISIBLE_FILES })}
        </div>
      )}
    </div>
  );
};

export const ActivityHeatmap: React.FC<ActivityHeatmapProps> = ({ projectPath }) => {
  const { t } = useTranslation();
  const [timeRange, setTimeRange] = useState('30');
  const { isRunning: isLoading, result: heatmap, error, run } = useAnalysisRunner<HeatmapData>();

  const loadHeatmap = () =>
    run(async () => {
      const since = computeSince(parseInt(timeRange));

      if (!window.api?.analyzeActivityHeatmap) {
        throw new Error('Activity heatmap not available');
      }
      const result = await window.api.analyzeActivityHeatmap(
        projectPath,
        since.toISOString(),
        new Date().toISOString()
      );
      return unwrapResponse<HeatmapData>(result);
    }, t('activityHeatmap.error'));

  return (
    <div className="space-y-4 p-4">
      <PanelCard className="p-4">
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

          <HeatmapControls
            timeRange={timeRange}
            onTimeRangeChange={setTimeRange}
            isLoading={isLoading}
            onAnalyze={loadHeatmap}
          />
        </div>
      </PanelCard>

      {error && (
        <ErrorBanner className="p-4">
          <div className="text-sm text-(--red)">{error}</div>
        </ErrorBanner>
      )}

      {heatmap && heatmap.files.length > 0 && <HeatmapResults heatmap={heatmap} />}

      {heatmap && heatmap.files.length === 0 && !isLoading && (
        <PanelCard className="p-4 text-center text-(--t2)">{t('activityHeatmap.noData')}</PanelCard>
      )}
    </div>
  );
};
