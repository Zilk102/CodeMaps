import React, { useCallback } from 'react';
import { useTranslation, Trans } from 'react-i18next';
import {
  hasPendingUpdate,
  isDownloadingUpdate,
  useUpdaterState,
  type UpdateState,
} from '../hooks/useUpdaterState';

const DismissedBadge: React.FC<{ onClick: () => void }> = ({ onClick }) => {
  const { t } = useTranslation();
  return (
    <div
      className="floating-toast absolute right-6 top-16 z-[1000] cursor-pointer rounded-full border px-3 py-1.5 hover:bg-(--hover) transition-colors"
      onClick={onClick}
      title={t('updateNotification.updateAvailable')}
    >
      <div className="flex items-center gap-2 text-[12px] font-medium text-(--t1)">
        <div className="w-2 h-2 rounded-full bg-(--acc) shadow-[0_0_8px_var(--acc)]" />
        <span>{t('updateNotification.updateAvailable')}</span>
      </div>
    </div>
  );
};

const DownloadProgress: React.FC<{ state: UpdateState; onLater: () => void }> = ({
  state,
  onLater,
}) => {
  const { t } = useTranslation();
  return (
    <div className="floating-toast absolute right-6 top-16 z-[999] flex w-[340px] flex-col gap-3 p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="section-label mb-1">{t('updateNotification.updateAvailable')}</div>
          <div className="text-[12px] font-medium text-(--t0)">
            {t('updateNotification.downloadingUpdate', {
              version: state.version ? `v${state.version}` : '',
              progress: state.progress,
            })}
          </div>
        </div>
        <button className="text-[12px] text-(--t2) hover:text-(--t0) font-medium" onClick={onLater}>
          {t('updateNotification.later')}
        </button>
      </div>
      <div className="h-1.5 overflow-hidden rounded-full bg-(--bg3)">
        <div
          className="h-full bg-(--acc) transition-[width] duration-300 linear"
          style={{ width: `${state.progress}%` }}
        />
      </div>
    </div>
  );
};

const DownloadIcon: React.FC = () => (
  <svg
    width="14"
    height="14"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
    <polyline points="7 10 12 15 17 10" />
    <line x1="12" y1="15" x2="12" y2="3" />
  </svg>
);

const UpdateReady: React.FC<{
  state: UpdateState;
  onLater: () => void;
  onRestart: () => void;
}> = ({ state, onLater, onRestart }) => {
  const { t } = useTranslation();
  return (
    <div className="floating-toast absolute right-6 top-16 z-[999] flex w-[380px] flex-col gap-4 p-4 border-(--acc)">
      <div className="flex min-w-0 items-start gap-3">
        <div className="mt-1 flex h-8 w-8 shrink-0 items-center justify-center rounded bg-(--accbg) text-(--acc)">
          <DownloadIcon />
        </div>
        <div className="min-w-0 flex-1">
          <div className="section-label mb-1">{t('updateNotification.updateAvailable')}</div>
          <div className="text-[13px] leading-relaxed text-(--t0)">
            <Trans
              i18nKey="updateNotification.updateReady"
              values={{ version: state.version }}
              components={{
                1: <strong className="font-semibold text-(--acc)" />,
              }}
            />
          </div>
        </div>
      </div>
      <div className="flex justify-end gap-2">
        <button onClick={onLater} className="btn-glass px-4">
          {t('updateNotification.later')}
        </button>
        <button
          onClick={onRestart}
          className="btn-primary px-4 py-1.5 rounded-md text-[13px] font-medium"
        >
          {t('updateNotification.restart')}
        </button>
      </div>
    </div>
  );
};

const CheckingToast: React.FC = () => {
  const { t } = useTranslation();
  return (
    <div className="floating-toast absolute right-6 top-16 z-[999] flex w-[300px] items-center gap-3 p-4">
      <div className="h-4 w-4 rounded-full border-2 border-(--border) border-t-(--acc) animate-spin" />
      <span className="text-[12px] font-medium text-(--t1)">
        {t('updateNotification.checkingForUpdates')}
      </span>
    </div>
  );
};

const UpdateNotification: React.FC = () => {
  const { state, dismissed, setDismissed } = useUpdaterState();

  const handleRestart = useCallback(() => {
    window.api?.installUpdate?.();
  }, []);

  const handleLater = useCallback(() => {
    setDismissed(true);
  }, [setDismissed]);

  if (dismissed) {
    return hasPendingUpdate(state) ? <DismissedBadge onClick={() => setDismissed(false)} /> : null;
  }

  if (state && isDownloadingUpdate(state))
    return <DownloadProgress state={state} onLater={handleLater} />;
  if (state?.downloaded) {
    return <UpdateReady state={state} onLater={handleLater} onRestart={handleRestart} />;
  }
  if (state?.checking) return <CheckingToast />;
  return null;
};

export default UpdateNotification;
