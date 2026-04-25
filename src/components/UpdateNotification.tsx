import React, { useState, useEffect, useCallback } from 'react';

interface UpdateState {
  checking: boolean;
  available: boolean;
  downloaded: boolean;
  version?: string;
  progress?: number;
  error?: string;
}

const UpdateNotification: React.FC = () => {
  const [state, setState] = useState<UpdateState | null>(null);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined' || !(window as any).api?.onUpdaterStateChange) {
      return;
    }

    // Get initial state
    (window as any).api.getUpdaterState?.().then((initialState: UpdateState) => {
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

    (window as any).api.onUpdaterStateChange(handler);

    return () => {
      (window as any).api.removeUpdaterListener?.();
    };
  }, []);

  const handleRestart = useCallback(() => {
    (window as any).api?.installUpdate?.();
  }, []);

  const handleLater = useCallback(() => {
    setDismissed(true);
  }, []);

  const handleCheck = useCallback(() => {
    (window as any).api?.checkForUpdates?.();
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
          title="Доступно обновление"
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
          Загрузка обновления {state.version ? `v${state.version}` : ''}… {state.progress}%
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
            Обновление <strong style={{ color: 'var(--cyan)' }}>v{state.version}</strong> готово к
            установке!
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
            Позже
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
            Перезапустить
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
        <span>Проверка обновлений…</span>
      </div>
    );
  }

  return null;
};

export default UpdateNotification;
