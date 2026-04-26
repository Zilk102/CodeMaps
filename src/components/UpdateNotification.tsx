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

  const handleCheck = useCallback(() => {
    window.api?.checkForUpdates?.();
    setState((prev) =>
      prev ? { ...prev, checking: true } : { checking: true, available: false, downloaded: false }
    );
  }, []);

  if (dismissed) {
    // Show a small dot indicator if update is available but dismissed
    if (state?.available || state?.downloaded) {
      return (
        <div
          style={{
            position: 'absolute',
            top: 8,
            right: 150,
            zIndex: 1000,
            cursor: 'pointer',
          }}
          onClick={() => setDismissed(false)}
          title={t('updateNotification.updateAvailable')}
        >
          <div
            style={{
              width: 8,
              height: 8,
              borderRadius: '50%',
              background: 'var(--cyan)',
              boxShadow: '0 0 8px var(--cyan)',
            }}
          />
        </div>
      );
    }
    return null;
  }

  // Download in progress
  if (state?.available && !state.downloaded && state.progress !== undefined && state.progress > 0) {
    return (
      <div
        style={{
          position: 'absolute',
          top: 48,
          left: 0,
          right: 0,
          zIndex: 999,
          background: 'var(--bg1)',
          borderBottom: '1px solid var(--border)',
          padding: '8px 16px',
          display: 'flex',
          alignItems: 'center',
          gap: 12,
          fontSize: 13,
          color: 'var(--t2)',
        }}
      >
        <div style={{ flex: 1 }}>
          {t('updateNotification.downloadingUpdate', {
            version: state.version ? `v${state.version}` : '',
            progress: state.progress
          })}
        </div>
        <div
          style={{
            width: 200,
            height: 4,
            background: 'var(--bg3)',
            borderRadius: 2,
            overflow: 'hidden',
          }}
        >
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

  // Update ready to install
  if (state?.downloaded) {
    return (
      <div
        style={{
          position: 'absolute',
          top: 48,
          left: 0,
          right: 0,
          zIndex: 999,
          background: 'var(--bg1)',
          borderBottom: '1px solid var(--cyan)',
          padding: '10px 16px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 12,
          fontSize: 13,
          color: 'var(--t1)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
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
          <span>
            <Trans
              i18nKey="updateNotification.updateReady"
              values={{ version: state.version }}
              components={{
                1: <strong style={{ color: 'var(--cyan)' }} />
              }}
            />
          </span>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button
            onClick={handleLater}
            style={{
              padding: '4px 12px',
              borderRadius: 4,
              border: '1px solid var(--border)',
              background: 'transparent',
              color: 'var(--t2)',
              fontSize: 12,
              cursor: 'pointer',
            }}
          >
            {t('updateNotification.later')}
          </button>
          <button
            onClick={handleRestart}
            style={{
              padding: '4px 12px',
              borderRadius: 4,
              border: 'none',
              background: 'var(--cyan)',
              color: 'var(--bg0)',
              fontSize: 12,
              cursor: 'pointer',
              fontWeight: 600,
            }}
          >
            {t('updateNotification.restart')}
          </button>
        </div>
      </div>
    );
  }

  // Update available (not yet downloaded) - typically auto-downloads, but show checking
  if (state?.checking) {
    return (
      <div
        style={{
          position: 'absolute',
          top: 48,
          left: 0,
          right: 0,
          zIndex: 999,
          background: 'var(--bg1)',
          borderBottom: '1px solid var(--border)',
          padding: '8px 16px',
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          fontSize: 13,
          color: 'var(--t2)',
        }}
      >
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
