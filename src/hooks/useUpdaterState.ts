// Hook that mirrors the auto-updater state from the main process for the update notification.
import { useEffect, useState } from 'react';

/**
 * Updater status as reported by the main process: checking, update available or downloaded, with
 * version, download progress or error when known.
 */
export interface UpdateState {
  checking: boolean;
  available: boolean;
  downloaded: boolean;
  version?: string;
  progress?: number;
  error?: string;
}

/** An update was found (downloading or ready to install). */
export const hasPendingUpdate = (state: UpdateState | null): boolean =>
  Boolean(state?.available || state?.downloaded);

/** An update is currently downloading and progress has started. */
export const isDownloadingUpdate = (state: UpdateState | null): boolean =>
  Boolean(
    state?.available && !state.downloaded && state.progress !== undefined && state.progress > 0
  );

/** Subscribes to the main-process updater and tracks the user's dismissal. */
export const useUpdaterState = () => {
  const [state, setState] = useState<UpdateState | null>(null);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined' || !window.api?.onUpdaterStateChange) {
      return;
    }

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

  return { state, dismissed, setDismissed };
};
