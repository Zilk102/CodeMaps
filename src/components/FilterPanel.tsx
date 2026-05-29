import React from 'react';
import { useTranslation } from 'react-i18next';
import { useGraphStore } from '../store/useStore';

export const FilterPanel: React.FC = () => {
  const { filters, layoutMode, setFilter, setLayoutMode } = useGraphStore();
  const { t } = useTranslation();

  const modeDescription = layoutMode === 'hierarchy'
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

  return (
    <div className="rounded-2xl border border-(--border) bg-(--bg1)/95 p-3 text-(--t1) shadow-[0_8px_24px_rgba(0,0,0,0.22)] backdrop-blur-sm">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="text-[10px] font-semibold uppercase tracking-[0.08em] text-(--t3)">
            {t('filterPanel.layoutMode')}
          </div>
          <h4 className="mt-1 text-[14px] font-semibold text-(--t0)">{t('filterPanel.filters')}</h4>
        </div>
      </div>

      <div className="mt-3">
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => setLayoutMode('hierarchy')}
            className={`rounded-full border px-3 py-1.5 text-[11px] font-medium transition-colors ${
              layoutMode === 'hierarchy'
                ? 'border-(--acc) bg-[rgba(68,170,255,0.12)] text-(--acc)'
                : 'border-(--border) bg-(--bg2) text-(--t2) hover:border-(--acc) hover:text-(--t0)'
            }`}
          >
            {t('filterPanel.hierarchy')}
          </button>
          <button
            type="button"
            onClick={() => setLayoutMode('dependencies')}
            className={`rounded-full border px-3 py-1.5 text-[11px] font-medium transition-colors ${
              layoutMode === 'dependencies'
                ? 'border-(--acc) bg-[rgba(68,170,255,0.12)] text-(--acc)'
                : 'border-(--border) bg-(--bg2) text-(--t2) hover:border-(--acc) hover:text-(--t0)'
            }`}
          >
            {t('filterPanel.dependencies')}
          </button>
        </div>
        <div className="mt-2 text-[11px] leading-5 text-(--t3)">
          {modeDescription}
        </div>
      </div>

      <div className="mt-3 grid grid-cols-2 gap-2">
        {filterItems.map((item) => (
          <label
            key={item.key}
            className="flex cursor-pointer items-center gap-2 rounded-xl border border-(--border) bg-(--bg2) px-2.5 py-2 text-[11px] text-(--t1) transition-colors hover:border-(--acc)"
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
