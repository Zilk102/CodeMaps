// Toolbar over the graph: layout mode switch, node-kind filter chips and a help popover.
import React, { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useGraphStore } from '../../store/useStore';
import type { GraphFilters, LayoutMode } from '../../types/graph';

interface FilterChip {
  key: keyof GraphFilters;
  label: string;
  /** Colour of the dot, matching what the shape looks like on the graph. */
  color: string;
}

const MODES: LayoutMode[] = ['hierarchy', 'dependencies'];

interface GraphToolbarProps {
  /** One-line explanation of the current mode and selection, shown in the help popover. */
  modeDescription: string;
  /** Rendered inside the help popover (legend, controls). */
  help: React.ReactNode;
}

/**
 * Returns a ref for a popover's container and calls close when the user presses outside it or hits
 * Escape while it is open.
 */
const useDismissOnOutsideClick = (open: boolean, close: () => void) => {
  const ref = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: PointerEvent) => {
      if (ref.current && !ref.current.contains(event.target as Node)) close();
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') close();
    };
    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open, close]);

  return ref;
};

/** Two-button switch between the hierarchy and dependency layouts. */
const ModeSwitch: React.FC<{
  layoutMode: LayoutMode;
  onChange: (mode: LayoutMode) => void;
}> = ({ layoutMode, onChange }) => {
  const { t } = useTranslation();
  return (
    <div
      role="group"
      aria-label={t('filterPanel.layoutMode')}
      className="pointer-events-auto flex rounded-xl border border-(--border) bg-(--bg1)/90 p-1 shadow-lg backdrop-blur-md"
    >
      {MODES.map((mode) => {
        const active = layoutMode === mode;
        return (
          <button
            key={mode}
            type="button"
            aria-pressed={active}
            onClick={() => onChange(mode)}
            className={`rounded-lg px-3.5 py-1.5 text-[12px] font-medium transition-colors ${
              active ? 'bg-(--bg2) text-(--t0) shadow-sm' : 'text-(--t2) hover:text-(--t0)'
            }`}
          >
            {t(`filterPanel.${mode}`)}
          </button>
        );
      })}
    </div>
  );
};

/**
 * Toggle chips for directories, files, functions, classes, ADRs and edges, each with a colour dot
 * like the shape on the graph.
 */
const FilterChips: React.FC<{
  filters: GraphFilters;
  onToggle: (key: keyof GraphFilters, value: boolean) => void;
}> = ({ filters, onToggle }) => {
  const { t } = useTranslation();
  const chips: FilterChip[] = [
    { key: 'showDirectories', label: t('filterPanel.directories'), color: 'var(--blue)' },
    { key: 'showFiles', label: t('filterPanel.files'), color: 'var(--green)' },
    { key: 'showFunctions', label: t('filterPanel.functions'), color: 'var(--cyan)' },
    { key: 'showClasses', label: t('filterPanel.classes'), color: 'var(--orange)' },
    { key: 'showADR', label: t('filterPanel.adr'), color: 'var(--purple)' },
    { key: 'showEdges', label: t('filterPanel.edges'), color: 'var(--t1)' },
  ];

  return (
    <div
      role="group"
      aria-label={t('filterPanel.filters')}
      className="pointer-events-auto flex flex-wrap items-center gap-1.5 rounded-xl border border-(--border) bg-(--bg1)/90 p-1.5 shadow-lg backdrop-blur-md"
    >
      {chips.map((chip) => {
        const active = filters[chip.key];
        return (
          <button
            key={chip.key}
            type="button"
            aria-pressed={active}
            onClick={() => onToggle(chip.key, !active)}
            className={`flex items-center gap-1.5 rounded-lg border px-2.5 py-1 text-[12px] transition-colors ${
              active
                ? 'border-(--border) bg-(--bg2) text-(--t0)'
                : 'border-transparent text-(--t3) hover:text-(--t1)'
            }`}
          >
            <span
              aria-hidden
              className="inline-block h-2 w-2 rounded-full transition-opacity"
              style={{ background: chip.color, opacity: active ? 1 : 0.3 }}
            />
            {chip.label}
          </button>
        );
      })}
    </div>
  );
};

/**
 * Question-mark button that opens a popover with the description of the current mode and the
 * legend.
 */
const HelpPopover: React.FC<{ modeDescription: string; help: React.ReactNode }> = ({
  modeDescription,
  help,
}) => {
  const { t } = useTranslation();
  const [helpOpen, setHelpOpen] = useState(false);
  const helpRef = useDismissOnOutsideClick(helpOpen, () => setHelpOpen(false));

  return (
    <div ref={helpRef} className="pointer-events-auto relative ml-auto">
      <button
        type="button"
        aria-expanded={helpOpen}
        aria-label={t('graphView.help.title')}
        title={t('graphView.help.title')}
        onClick={() => setHelpOpen((value) => !value)}
        className={`flex h-9 w-9 items-center justify-center rounded-xl border border-(--border) bg-(--bg1)/90 text-[14px] shadow-lg backdrop-blur-md transition-colors hover:text-(--t0) ${
          helpOpen ? 'text-(--t0)' : 'text-(--t2)'
        }`}
      >
        ?
      </button>
      {helpOpen && (
        <div className="absolute right-0 top-full mt-2 w-[300px] rounded-xl border border-(--border) bg-(--bg1)/95 p-4 text-[12px] leading-relaxed text-(--t1) shadow-xl backdrop-blur-md">
          <div className="mb-1 font-semibold text-(--t0)">{t('graphView.help.title')}</div>
          <p className="mb-3 text-(--t2)">{modeDescription}</p>
          {help}
        </div>
      )}
    </div>
  );
};

/**
 * Top bar of the graph: mode switch, filters and help. It reads and updates the graph filters and
 * layout mode in the store.
 */
export const GraphToolbar: React.FC<GraphToolbarProps> = ({ modeDescription, help }) => {
  const { filters, layoutMode, setLayoutMode, setFilter } = useGraphStore();

  return (
    <div className="pointer-events-none absolute left-3 right-3 top-3 z-20 flex flex-wrap items-center gap-2">
      <ModeSwitch layoutMode={layoutMode} onChange={setLayoutMode} />
      <FilterChips filters={filters} onToggle={setFilter} />
      <HelpPopover modeDescription={modeDescription} help={help} />
    </div>
  );
};
