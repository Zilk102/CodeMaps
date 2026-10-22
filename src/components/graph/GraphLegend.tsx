import React from 'react';
import { useTranslation } from 'react-i18next';

const ITEMS: Array<{ key: string; color: string; shape?: 'dashed' | 'round' }> = [
  { key: 'directory', color: 'var(--blue)' },
  { key: 'file', color: 'var(--green)' },
  { key: 'class', color: 'var(--orange)', shape: 'round' },
  { key: 'function', color: 'var(--cyan)', shape: 'round' },
  { key: 'adr', color: 'var(--purple)' },
  { key: 'churn', color: 'var(--red)', shape: 'dashed' },
];

/** Controls hint and colour legend, shown inside the toolbar's help popover. */
export const GraphLegend: React.FC = () => {
  const { t } = useTranslation();

  return (
    <div className="flex flex-col gap-3">
      <p className="text-(--t2)">{t('graphView.controlsHint')}</p>
      <div>
        <div className="section-label mb-2">{t('graphView.legend.title')}</div>
        <ul className="flex flex-col gap-1.5">
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
      </div>
    </div>
  );
};
