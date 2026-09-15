import React from 'react';
import { useTranslation } from 'react-i18next';
import { useGraphStore } from '../store/useStore';

export const FilterPanel: React.FC = () => {
  const { filters, layoutMode, setFilter, setLayoutMode } = useGraphStore();
  const { t } = useTranslation();

  const modeDescription =
    layoutMode === 'hierarchy'
      ? t('filterPanel.hierarchyDescription')
      : t('filterPanel.dependenciesDescription');

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
    <div className="surface-card rounded-[20px] border border-(--border) bg-(--bg1)/96 p-3.5 text-(--t1) backdrop-blur-sm">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="section-label">{t('filterPanel.layoutMode')}</div>
          <h4 className="mt-1 text-[15px] font-semibold text-(--t0)">{t('filterPanel.filters')}</h4>
          <div className="mt-1 text-[11px] text-(--t3)">
            {t('filterPanel.enabledSummary', { count: enabledCount, total: filterItems.length })}
          </div>
        </div>
        <div className="rounded-full border border-(--border) bg-(--bg2) px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.08em] text-(--t2)">
          {layoutMode === 'hierarchy' ? t('filterPanel.hierarchy') : t('filterPanel.dependencies')}
        </div>
      </div>

      <div className="mt-3 space-y-3">
        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={() => setLayoutMode('hierarchy')}
            className={`rounded-2xl border px-3 py-2.5 text-left transition-colors ${
              layoutMode === 'hierarchy'
                ? 'border-(--acc) bg-[rgba(0,255,157,0.12)] text-(--t0)'
                : 'border-(--border) bg-(--bg2) text-(--t2) hover:border-(--acc) hover:text-(--t0)'
            }`}
          >
            <div className="text-[11px] font-semibold">{t('filterPanel.hierarchy')}</div>
            <div className="mt-1 text-[10px] leading-4 text-(--t3)">
              {t('filterPanel.hierarchyDescription')}
            </div>
          </button>
          <button
            type="button"
            onClick={() => setLayoutMode('dependencies')}
            className={`rounded-2xl border px-3 py-2.5 text-left transition-colors ${
              layoutMode === 'dependencies'
                ? 'border-(--acc) bg-[rgba(0,255,157,0.12)] text-(--t0)'
                : 'border-(--border) bg-(--bg2) text-(--t2) hover:border-(--acc) hover:text-(--t0)'
            }`}
          >
            <div className="text-[11px] font-semibold">{t('filterPanel.dependencies')}</div>
            <div className="mt-1 text-[10px] leading-4 text-(--t3)">
              {t('filterPanel.dependenciesDescription')}
            </div>
          </button>
        </div>

        <div className="rounded-2xl border border-(--border) bg-(--bg2)/80 p-2.5">
          <div className="mb-2 text-[10px] font-semibold uppercase tracking-[0.08em] text-(--t3)">
            {t('filterPanel.presets')}
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => applyPreset('all')}
              className="rounded-full border border-(--border) bg-(--bg1) px-3 py-1.5 text-[10px] font-semibold text-(--t2) transition-colors hover:border-(--acc) hover:text-(--t0)"
            >
              {t('filterPanel.showAll')}
            </button>
            <button
              type="button"
              onClick={() => applyPreset('focus')}
              className="rounded-full border border-(--border) bg-(--bg1) px-3 py-1.5 text-[10px] font-semibold text-(--t2) transition-colors hover:border-(--acc) hover:text-(--t0)"
            >
              {t('filterPanel.focusCode')}
            </button>
            <button
              type="button"
              onClick={() => applyPreset('reset')}
              className="rounded-full border border-(--border) bg-(--bg1) px-3 py-1.5 text-[10px] font-semibold text-(--t2) transition-colors hover:border-(--acc) hover:text-(--t0)"
            >
              {t('filterPanel.reset')}
            </button>
          </div>
        </div>

        <div className="rounded-xl border border-[rgba(255,255,255,0.05)] bg-[rgba(255,255,255,0.02)] px-3 py-2 text-[11px] leading-5 text-(--t3)">
          {modeDescription}
        </div>
      </div>

      <div className="mt-3 grid grid-cols-2 gap-2">
        {filterItems.map((item) => (
          <label
            key={item.key}
            className={`flex cursor-pointer items-center gap-2 rounded-2xl border px-2.5 py-2.5 text-[11px] transition-colors ${
              filters[item.key]
                ? 'border-[rgba(0,255,157,0.4)] bg-[rgba(0,255,157,0.08)] text-(--t0)'
                : 'border-(--border) bg-(--bg2) text-(--t1) hover:border-(--acc)'
            }`}
          >
            <input
              type="checkbox"
              checked={filters[item.key]}
              onChange={(e) => setFilter(item.key, e.target.checked)}
              className="h-3.5 w-3.5 shrink-0"
              style={{ accentColor: 'var(--acc)' }}
            />
            <span className="leading-4">{item.label}</span>
          </label>
        ))}
      </div>
    </div>
  );
};
