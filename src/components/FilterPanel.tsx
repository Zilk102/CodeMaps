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
    <div className="surface-card p-5 text-(--t1) w-[320px] shadow-lg flex flex-col gap-6">
      {/* Header */}
      <div>
        <div className="flex items-center justify-between mb-1">
          <h4 className="text-[15px] font-semibold text-(--t0) tracking-tight">
            {t('filterPanel.filters')}
          </h4>
          <div className="text-[12px] font-medium text-(--t3) bg-(--bg2) px-2 py-0.5 rounded-full">
            {enabledCount} / {filterItems.length}
          </div>
        </div>
        <div className="text-[12px] text-(--t3)">
          {t('filterPanel.enabledSummary', { count: enabledCount, total: filterItems.length })}
        </div>
      </div>

      {/* Layout Mode - Segmented Control */}
      <div>
        <div className="section-label mb-3">{t('filterPanel.layoutMode')}</div>
        <div className="flex p-1 bg-(--bg2) rounded-lg border border-(--border)">
          <button
            type="button"
            onClick={() => setLayoutMode('hierarchy')}
            className={`flex-1 text-[12px] font-medium py-1.5 rounded-md transition-all duration-200 ${
              layoutMode === 'hierarchy'
                ? 'bg-(--bg1) text-(--t0) shadow-sm border border-(--border)'
                : 'text-(--t2) hover:text-(--t1) border border-transparent'
            }`}
          >
            {t('filterPanel.hierarchy')}
          </button>
          <button
            type="button"
            onClick={() => setLayoutMode('dependencies')}
            className={`flex-1 text-[12px] font-medium py-1.5 rounded-md transition-all duration-200 ${
              layoutMode === 'dependencies'
                ? 'bg-(--bg1) text-(--t0) shadow-sm border border-(--border)'
                : 'text-(--t2) hover:text-(--t1) border border-transparent'
            }`}
          >
            {t('filterPanel.dependencies')}
          </button>
        </div>
        <div className="mt-2 text-[11px] text-(--t3) leading-relaxed">
          {layoutMode === 'hierarchy'
            ? t('filterPanel.hierarchyDescription')
            : t('filterPanel.dependenciesDescription')}
        </div>
      </div>

      {/* Presets */}
      <div>
        <div className="section-label mb-2">{t('filterPanel.presets')}</div>
        <div className="flex bg-(--bg2) p-1 rounded-lg border border-(--border)">
          <button
            type="button"
            onClick={() => applyPreset('all')}
            className="flex-1 text-[11px] font-medium py-1 rounded transition-colors text-(--t2) hover:text-(--t0) hover:bg-(--bg1)"
            title={t('filterPanel.showAll')}
          >
            {t('filterPanel.showAll')}
          </button>
          <button
            type="button"
            onClick={() => applyPreset('focus')}
            className="flex-1 text-[11px] font-medium py-1 rounded transition-colors text-(--t2) hover:text-(--t0) hover:bg-(--bg1)"
            title={t('filterPanel.focusCode')}
          >
            {t('filterPanel.focusCode')}
          </button>
          <button
            type="button"
            onClick={() => applyPreset('reset')}
            className="flex-1 text-[11px] font-medium py-1 rounded transition-colors text-(--t2) hover:text-(--red) hover:bg-(--bg1)"
            title={t('filterPanel.reset')}
          >
            {t('filterPanel.reset')}
          </button>
        </div>
      </div>

      {/* Toggles */}
      <div>
        <div className="section-label mb-3">{t('filterPanel.filters')}</div>
        <div className="flex flex-col gap-1">
          {filterItems.map((item) => (
            <label
              key={item.key}
              className="group flex cursor-pointer items-center justify-between rounded-lg p-2 transition-colors hover:bg-(--hover)"
            >
              <span className="text-[13px] font-medium text-(--t1) group-hover:text-(--t0) transition-colors">
                {item.label}
              </span>
              <div
                className={`relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors duration-300 ${
                  filters[item.key] ? 'bg-(--acc)' : 'bg-(--border)'
                }`}
              >
                <span
                  className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform duration-300 shadow-sm ${
                    filters[item.key] ? 'translate-x-[18px]' : 'translate-x-[2px]'
                  }`}
                />
              </div>
            </label>
          ))}
        </div>
      </div>
    </div>
  );
};
