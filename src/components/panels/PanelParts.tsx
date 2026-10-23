import React from 'react';

const CARD_BASE = 'rounded-2xl border border-(--border) bg-(--bg2)';

interface PanelCardProps {
  className?: string;
  children: React.ReactNode;
}

/** Rounded surface used for every block inside the tool panels. */
export const PanelCard: React.FC<PanelCardProps> = ({ className = '', children }) => (
  <div className={className ? `${CARD_BASE} ${className}` : CARD_BASE}>{children}</div>
);

interface PanelHeaderProps {
  eyebrow: string;
  title: string;
  description: string;
}

/** Intro card at the top of a tool panel: eyebrow, title and description. */
export const PanelHeader: React.FC<PanelHeaderProps> = ({ eyebrow, title, description }) => (
  <PanelCard className="p-4">
    <div className="text-[12px] font-semibold uppercase tracking-[0.12em] text-(--t3)">
      {eyebrow}
    </div>
    <h3 className="mt-2 text-[16px] font-semibold text-(--t0)">{title}</h3>
    <p className="mt-2 text-[13px] leading-6 text-(--t2)">{description}</p>
  </PanelCard>
);

interface StatTileProps {
  label: string;
  value: React.ReactNode;
  valueClassName?: string;
}

/** Small card showing one number with a caption above it. */
export const StatTile: React.FC<StatTileProps> = ({
  label,
  value,
  valueClassName = 'text-(--t0)',
}) => (
  <PanelCard className="p-4">
    <div className="text-[11px] uppercase tracking-[0.08em] text-(--t3)">{label}</div>
    <div className={`mt-2 text-[24px] font-semibold ${valueClassName}`}>{value}</div>
  </PanelCard>
);

interface ErrorBannerProps {
  className?: string;
  children: React.ReactNode;
}

/** Red error box. Callers pass the padding/text classes that differ between panels. */
export const ErrorBanner: React.FC<ErrorBannerProps> = ({ className = '', children }) => (
  <div
    className={`rounded-2xl border border-[rgba(255,107,107,0.35)] bg-[rgba(255,107,107,0.08)] ${className}`}
  >
    {children}
  </div>
);

interface SelectedNodeBarProps {
  label: string;
  selectedLabel: string;
  useSelectedLabel: string;
  hasSelection: boolean;
  summary: string | null;
  onUseSelected: () => void;
}

/** Heading row with a "use selected" button, plus the selected-node summary box. */
export const SelectedNodeBar: React.FC<SelectedNodeBarProps> = ({
  label,
  selectedLabel,
  useSelectedLabel,
  hasSelection,
  summary,
  onUseSelected,
}) => (
  <>
    <div className="flex items-center justify-between gap-3">
      <div className="text-[12px] font-semibold uppercase tracking-[0.12em] text-(--t3)">
        {label}
      </div>
      {hasSelection && (
        <button
          type="button"
          onClick={onUseSelected}
          className="rounded-lg border border-(--border) bg-(--bg1) px-3 py-1.5 text-[12px] font-medium text-(--t1) transition-colors hover:border-(--acc) hover:text-(--acc)"
        >
          {useSelectedLabel}
        </button>
      )}
    </div>

    {summary && (
      <div className="rounded-xl border border-(--border) bg-(--bg1) px-3 py-2">
        <div className="text-[11px] text-(--t3)">{selectedLabel}</div>
        <div className="mt-1 text-[13px] font-medium text-(--t0)">{summary}</div>
      </div>
    )}
  </>
);
