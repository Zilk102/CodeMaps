import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';

const ITEMS: Array<{ key: string; color: string; shape?: 'dashed' | 'round' }> = [
  { key: 'directory', color: 'var(--blue)' },
  { key: 'file', color: 'var(--green)' },
  { key: 'class', color: 'var(--orange)', shape: 'round' },
  { key: 'function', color: 'var(--cyan)', shape: 'round' },
  { key: 'adr', color: 'var(--purple)' },
  { key: 'churn', color: 'var(--red)', shape: 'dashed' },
];

export const GraphLegend: React.FC = () => {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);

  return (
    <div className="surface-card pointer-events-auto w-[220px] text-[12px] text-(--t1) shadow-lg backdrop-blur-md">
      <button
        type="button"
        className="flex w-full items-center justify-between px-3 py-2 font-semibold text-(--t0)"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
      >
        {t('graphView.legend.title')}
        <span className="text-(--t3)">{open ? '▾' : '▸'}</span>
      </button>
      {open && (
        <ul className="flex flex-col gap-1.5 px-3 pb-3">
          {ITEMS.map((item) => (
            <li key={item.key} className="flex items-center gap-2">
              <span
                aria-hidden
                className="inline-block h-3 w-5 shrink-0"
                style={{
                  border: `2px ${item.shape === 'dashed' ? 'dashed' : 'solid'} ${item.color}`,
                  borderRadius: item.shape === 'round' ? '6px' : '3px',
                  background:
                    item.shape === 'dashed'
                      ? 'transparent'
                      : `color-mix(in srgb, ${item.color} 30%, transparent)`,
                }}
              />
              <span>{t(`graphView.legend.${item.key}`)}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
};
