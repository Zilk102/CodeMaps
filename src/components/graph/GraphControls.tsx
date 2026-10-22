import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';

const HINT_STORAGE_KEY = 'codemaps-graph-hint-dismissed';

const readDismissed = () => {
  try {
    return window.localStorage.getItem(HINT_STORAGE_KEY) === '1';
  } catch {
    return false;
  }
};

interface GraphControlsProps {
  onFit: () => void;
  onZoomIn: () => void;
  onZoomOut: () => void;
}

export const GraphControls: React.FC<GraphControlsProps> = ({ onFit, onZoomIn, onZoomOut }) => {
  const { t } = useTranslation();
  return (
    <div className="absolute bottom-3 left-3 z-10 flex flex-col overflow-hidden rounded-lg border border-(--border) bg-(--bg1)/95 shadow-lg backdrop-blur-md">
      {[
        { key: 'in', label: '+', title: t('graphView.zoomIn'), onClick: onZoomIn },
        { key: 'out', label: '−', title: t('graphView.zoomOut'), onClick: onZoomOut },
        { key: 'fit', label: '⤢', title: t('graphView.fitToView'), onClick: onFit },
      ].map((control) => (
        <button
          key={control.key}
          type="button"
          title={control.title}
          aria-label={control.title}
          onClick={control.onClick}
          className="h-9 w-9 text-[16px] text-(--t1) transition-colors hover:bg-(--bg2) hover:text-(--t0)"
        >
          {control.label}
        </button>
      ))}
    </div>
  );
};

export const GraphHint: React.FC = () => {
  const { t } = useTranslation();
  const [dismissed, setDismissed] = useState(readDismissed);

  if (dismissed) return null;

  const dismiss = () => {
    setDismissed(true);
    try {
      window.localStorage.setItem(HINT_STORAGE_KEY, '1');
    } catch {
      // The hint simply reappears next time when storage is unavailable.
    }
  };

  return (
    <div className="pointer-events-auto flex items-center justify-between gap-3 rounded-lg border border-(--border) bg-(--bg1)/95 px-3 py-2 text-[12px] text-(--t1) shadow-lg backdrop-blur-md">
      <span>{t('graphView.controlsHint')}</span>
      <button
        type="button"
        className="text-(--t3) hover:text-(--t0)"
        onClick={dismiss}
        aria-label={t('graphView.dismissHint')}
      >
        ✕
      </button>
    </div>
  );
};
