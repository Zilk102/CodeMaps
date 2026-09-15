import React, { useState, useEffect, useCallback } from 'react';
import { useTranslation, Trans } from 'react-i18next';

interface UpdateState {
  checking: boolean;
  available: boolean;
  downloaded: boolean;
  version?: string;
  progress?: number;
  error?: string;
}

const UpdateNotification: React.FC = () => {
  const { t } = useTranslation();
  const [state, setState] = useState<UpdateState | null>(null);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined' || !window.api?.onUpdaterStateChange) {
      return;
    }

    // Get initial state
    window.api.getUpdaterState?.().then((initialState: UpdateState) => {
      if (initialState.available || initialState.downloaded) {
        setState(initialState);
      }
    });

    const handler = (newState: UpdateState) => {
      setState(newState);
      if (newState.available || newState.downloaded) {
        setDismissed(false);
      }
    };

    window.api.onUpdaterStateChange(handler);

    return () => {
      window.api.removeUpdaterListener?.();
    };
  }, []);

  const handleRestart = useCallback(() => {
    window.api?.installUpdate?.();
  }, []);

  const handleLater = useCallback(() => {
    setDismissed(true);
  }, []);

  if (dismissed) {
    if (state?.available || state?.downloaded) {
      return (
        <div
          className="floating-toast absolute right-5 top-4 z-[1000] cursor-pointer rounded-full border px-3 py-2"
          onClick={() => setDismissed(false)}
          title={t('updateNotification.updateAvailable')}
        >
          <div className="flex items-center gap-2 text-[11px] text-(--t1)">
            <div
              style={{
                width: 8,
                height: 8,
                borderRadius: '50%',
                background: 'var(--cyan)',
                boxShadow: '0 0 8px var(--cyan)',
              }}
            />
            <span>{t('updateNotification.updateAvailable')}</span>
          </div>
        </div>
      );
    }
    return null;
  }

  if (state?.available && !state.downloaded && state.progress !== undefined && state.progress > 0) {
    return (
      <div className="floating-toast absolute right-5 top-20 z-[999] flex w-[min(420px,calc(100%-2.5rem))] flex-col gap-3 rounded-2xl p-4 text-[13px] text-(--t2)">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="section-label">{t('updateNotification.updateAvailable')}</div>
            <div className="mt-1 text-[13px] text-(--t1)">
              {t('updateNotification.downloadingUpdate', {
                version: state.version ? `v${state.version}` : '',
                progress: state.progress,
              })}
            </div>
          </div>
          <button className="btn-glass" onClick={handleLater}>
            {t('updateNotification.later')}
          </button>
        </div>
        <div className="h-1.5 overflow-hidden rounded-full bg-(--bg3)">
          <div
            style={{
              width: `${state.progress}%`,
              height: '100%',
              background: 'var(--cyan)',
              transition: 'width 0.3s linear',
            }}
          />
        </div>
      </div>
    );
  }

  if (state?.downloaded) {
    return (
      <div className="floating-toast absolute right-5 top-20 z-[999] flex w-[min(460px,calc(100%-2.5rem))] items-center justify-between gap-4 rounded-2xl border-[rgba(34,211,238,0.32)] p-4 text-[13px] text-(--t1)">
        <div className="flex min-w-0 items-center gap-3">
          <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="var(--cyan)"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
            <polyline points="7 10 12 15 17 10" />
            <line x1="12" y1="15" x2="12" y2="3" />
          </svg>
          <div className="min-w-0">
            <div className="section-label">{t('updateNotification.updateAvailable')}</div>
            <div className="mt-1">
              <Trans
                i18nKey="updateNotification.updateReady"
                values={{ version: state.version }}
                components={{
                  1: <strong style={{ color: 'var(--cyan)' }} />,
                }}
              />
            </div>
          </div>
        </div>
        <div className="flex shrink-0 gap-2">
          <button onClick={handleLater} className="btn-glass">
            {t('updateNotification.later')}
          </button>
          <button onClick={handleRestart} className="btn-glass btn-primary">
            {t('updateNotification.restart')}
          </button>
        </div>
      </div>
    );
  }

  if (state?.checking) {
    return (
      <div className="floating-toast absolute right-5 top-20 z-[999] flex w-[min(360px,calc(100%-2.5rem))] items-center gap-3 rounded-2xl p-4 text-[13px] text-(--t2)">
        <div
          style={{
            width: 14,
            height: 14,
            border: '2px solid var(--border)',
            borderTopColor: 'var(--acc)',
            borderRadius: '50%',
            animation: 'spin 1s linear infinite',
          }}
        />
        <span>{t('updateNotification.checkingForUpdates')}</span>
      </div>
    );
  }

  return null;
};

export default UpdateNotification;
