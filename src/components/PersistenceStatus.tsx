import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';

interface PersistenceStatusProps {
  isLoading?: boolean;
  isSaving?: boolean;
  lastSaved?: Date | null;
  error?: string | null;
}

const PersistenceStatus: React.FC<PersistenceStatusProps> = ({
  isLoading = false,
  isSaving = false,
  lastSaved = null,
  error = null
}) => {
  const { t } = useTranslation();
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    let isMounted = true;
    
    // We defer the visibility update slightly to avoid synchronous setState during effect evaluation
    const initialTimer = setTimeout(() => {
      if (isMounted) {
        if (error || isSaving || isLoading || lastSaved) {
          setVisible(true);
        } else {
          setVisible(false);
        }
      }
    }, 0);
    
    let timeoutTimer: ReturnType<typeof setTimeout> | undefined;
    
    if (error || isSaving || isLoading || lastSaved) {
      let timeout = 0;
      if (error) {
        timeout = 5000;
      } else if (lastSaved) {
        timeout = 3000;
      }
      
      if (timeout > 0) {
        timeoutTimer = setTimeout(() => {
          if (isMounted) setVisible(false);
        }, timeout);
      }
    }
    
    return () => {
      isMounted = false;
      clearTimeout(initialTimer);
      if (timeoutTimer) clearTimeout(timeoutTimer);
    };
  }, [isLoading, isSaving, lastSaved, error]);

  if (!visible) return null;

  let message = '';
  let type: 'info' | 'success' | 'error' = 'info';

  if (error) {
    message = error;
    type = 'error';
  } else if (isSaving) {
    message = t('persistence.savingGraph');
    type = 'info';
  } else if (isLoading) {
    message = t('persistence.loadingGraph');
    type = 'info';
  } else if (lastSaved) {
    message = t('persistence.graphSaved');
    type = 'success';
  }

  const bgColors = {
    info: 'bg-blue-500/90',
    success: 'bg-green-500/90',
    error: 'bg-red-500/90'
  };

  return (
    <div
      className={`fixed bottom-4 right-4 z-50 px-4 py-2 rounded-lg shadow-lg text-white text-sm font-medium transition-all duration-300 ${bgColors[type]}`}
      role="status"
      aria-live="polite"
    >
      <div className="flex items-center gap-2">
        {(isLoading || isSaving) && (
          <svg
            className="animate-spin h-4 w-4"
            xmlns="http://www.w3.org/2000/svg"
            fill="none"
            viewBox="0 0 24 24"
          >
            <circle
              className="opacity-25"
              cx="12"
              cy="12"
              r="10"
              stroke="currentColor"
              strokeWidth="4"
            />
            <path
              className="opacity-75"
              fill="currentColor"
              d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
            />
          </svg>
        )}
        <span>{message}</span>
      </div>
    </div>
  );
};

export default PersistenceStatus;
