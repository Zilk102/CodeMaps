import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';

interface PersistenceStatusProps {
  isLoading?: boolean;
  isSaving?: boolean;
  lastSaved?: Date | null;
  error?: string | null;
}

export const PersistenceStatus: React.FC<PersistenceStatusProps> = ({
  isLoading = false,
  isSaving = false,
  lastSaved = null,
  error = null
}) => {
  const { t } = useTranslation();
  const [visible, setVisible] = useState(false);
  const [message, setMessage] = useState('');
  const [type, setType] = useState<'info' | 'success' | 'error'>('info');

  useEffect(() => {
    if (error) {
      setMessage(error);
      setType('error');
      setVisible(true);
      const timer = setTimeout(() => setVisible(false), 5000);
      return () => clearTimeout(timer);
    }

    if (isSaving) {
      setMessage(t('persistence.savingGraph'));
      setType('info');
      setVisible(true);
    } else if (isLoading) {
      setMessage(t('persistence.loadingGraph'));
      setType('info');
      setVisible(true);
    } else if (lastSaved) {
      setMessage(t('persistence.graphSaved'));
      setType('success');
      setVisible(true);
      const timer = setTimeout(() => setVisible(false), 3000);
      return () => clearTimeout(timer);
    }
  }, [isLoading, isSaving, lastSaved, error, t]);

  if (!visible) return null;

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
