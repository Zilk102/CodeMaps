import React from 'react';
import { useTranslation } from 'react-i18next';
import { useGraphStore } from '../store/useStore';

export const FilterPanel: React.FC = () => {
  const { filters, layoutMode, setFilter, setLayoutMode } = useGraphStore();
  const { t } = useTranslation();

  const filterItems = [
    { key: 'showDirectories', label: t('filterPanel.directories') },
    { key: 'showFiles', label: t('filterPanel.files') },
    { key: 'showFunctions', label: t('filterPanel.functions') },
    { key: 'showClasses', label: t('filterPanel.classes') },
    { key: 'showADR', label: t('filterPanel.adr') },
    { key: 'showEdges', label: t('filterPanel.edges') },
  ] as const;

  const enabledCount = filterItems.filter((item) => filters[item.key]).length;

  const applyPreset = (preset: 'all' | 'focus' | 'reset') => {
    const nextState: Record<(typeof filterItems)[number]['key'], boolean> =
      preset === 'all'
        ? {
            showDirectories: true,
            showFiles: true,
            showFunctions: true,
            showClasses: true,
            showADR: true,
            showEdges: true,
          }
        : preset === 'focus'
          ? {
              showDirectories: false,
              showFiles: true,
              showFunctions: true,
              showClasses: true,
              showADR: false,
              showEdges: true,
            }
          : {
              showDirectories: true,
              showFiles: true,
              showFunctions: false,
              showClasses: false,
              showADR: true,
              showEdges: true,
            };

    filterItems.forEach((item) => {
      setFilter(item.key, nextState[item.key]);
    });
  };

  return (
    <div className="surface-card p-4 text-(--t1) w-[320px]">
      <div className="flex items-start justify-between gap-3 mb-4">
        <div>
          <div className="section-label mb-1">{t('filterPanel.layoutMode')}</div>
          <h4 className="text-[14px] font-semibold text-(--t0) leading-tight">
            {t('filterPanel.filters')}
          </h4>
          <div className="text-[12px] text-(--t3) mt-0.5">
            {t('filterPanel.enabledSummary', { count: enabledCount, total: filterItems.length })}
          </div>
        </div>
        <div className="status-chip text-[10px] font-bold uppercase tracking-wide">
          {layoutMode === 'hierarchy' ? t('filterPanel.hierarchy') : t('filterPanel.dependencies')}
        </div>
      </div>

      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={() => setLayoutMode('hierarchy')}
            className={`rounded-lg border px-3 py-2 text-left transition-colors ${
              layoutMode === 'hierarchy'
                ? 'border-(--acc) bg-(--accbg) text-(--t0)'
                : 'border-(--border) bg-(--bg2) text-(--t2) hover:border-(--border2) hover:text-(--t1)'
            }`}
          >
            <div className="text-[12px] font-medium mb-1">{t('filterPanel.hierarchy')}</div>
            <div className="text-[11px] leading-snug text-(--t3)">
              {t('filterPanel.hierarchyDescription')}
            </div>
          </button>
          <button
            type="button"
            onClick={() => setLayoutMode('dependencies')}
            className={`rounded-lg border px-3 py-2 text-left transition-colors ${
              layoutMode === 'dependencies'
                ? 'border-(--acc) bg-(--accbg) text-(--t0)'
                : 'border-(--border) bg-(--bg2) text-(--t2) hover:border-(--border2) hover:text-(--t1)'
            }`}
          >
            <div className="text-[12px] font-medium mb-1">{t('filterPanel.dependencies')}</div>
            <div className="text-[11px] leading-snug text-(--t3)">
              {t('filterPanel.dependenciesDescription')}
            </div>
          </button>
        </div>

        <div className="rounded-lg border border-(--border) bg-(--bg2) p-3">
          <div className="mb-2.5 text-[11px] font-semibold uppercase tracking-wider text-(--t3)">
            {t('filterPanel.presets')}
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => applyPreset('all')}
              className="flex-1 rounded-md border border-(--border) bg-(--bg1) py-1.5 text-[11px] font-medium text-(--t2) transition-colors hover:border-(--t3) hover:text-(--t0)"
            >
              {t('filterPanel.showAll')}
            </button>
            <button
              type="button"
              onClick={() => applyPreset('focus')}
              className="flex-1 rounded-md border border-(--border) bg-(--bg1) py-1.5 text-[11px] font-medium text-(--t2) transition-colors hover:border-(--t3) hover:text-(--t0)"
            >
              {t('filterPanel.focusCode')}
            </button>
            <button
              type="button"
              onClick={() => applyPreset('reset')}
              className="flex-1 rounded-md border border-(--border) bg-(--bg1) py-1.5 text-[11px] font-medium text-(--t2) transition-colors hover:border-(--t3) hover:text-(--t0)"
            >
              {t('filterPanel.reset')}
            </button>
          </div>
        </div>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-2">
        {filterItems.map((item) => (
          <label
            key={item.key}
            className={`flex cursor-pointer items-center gap-2.5 rounded-lg border px-3 py-2 text-[12px] font-medium transition-colors ${
              filters[item.key]
                ? 'border-(--acc) bg-(--accbg) text-(--t0)'
                : 'border-(--border) bg-(--bg2) text-(--t1) hover:border-(--border2)'
            }`}
          >
            <div
              className={`w-3.5 h-3.5 rounded-sm border flex items-center justify-center transition-colors ${
                filters[item.key] ? 'bg-(--acc) border-(--acc)' : 'border-(--t3) bg-transparent'
              }`}
            >
              {filters[item.key] && (
                <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
                  <path
                    d="M2 5L4 7L8 3"
                    stroke="white"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              )}
            </div>
            <span className="leading-none">{item.label}</span>
          </label>
        ))}
      </div>
    </div>
  );
};
