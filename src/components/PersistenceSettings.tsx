import React from 'react';
import { useTranslation } from 'react-i18next';

interface PersistenceSettingsProps {
  enabled: boolean;
  onToggle: (enabled: boolean) => void;
  onClearCache: () => void;
}

export const PersistenceSettings: React.FC<PersistenceSettingsProps> = ({
  enabled,
  onToggle,
  onClearCache
}) => {
  const { t } = useTranslation();

  return (
    <div className="space-y-4">
      <div className="border-b border-gray-200 dark:border-gray-700 pb-4">
        <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-2">
          {t('persistence.settings')}
        </h3>
        <p className="text-sm text-gray-500 dark:text-gray-400">
          {t('persistence.enablePersistenceDescription')}
        </p>
      </div>

      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${enabled ? 'bg-blue-600' : 'bg-gray-200 dark:bg-gray-700'}`}>
            <button
              onClick={() => onToggle(!enabled)}
              className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${enabled ? 'translate-x-6' : 'translate-x-1'}`}
              aria-label={enabled ? t('persistence.persistenceEnabled') : t('persistence.persistenceDisabled')}
            />
          </div>
          <span className="text-sm font-medium text-gray-900 dark:text-white">
            {t('persistence.enablePersistence')}
          </span>
        </div>
        <span className={`text-xs font-medium ${enabled ? 'text-green-600' : 'text-gray-500'}`}>
          {enabled ? t('persistence.persistenceEnabled') : t('persistence.persistenceDisabled')}
        </span>
      </div>

      <div className="pt-4 border-t border-gray-200 dark:border-gray-700">
        <button
          onClick={onClearCache}
          className="inline-flex items-center px-3 py-2 border border-gray-300 dark:border-gray-600 shadow-sm text-sm leading-4 font-medium rounded-md text-gray-700 dark:text-gray-200 bg-white dark:bg-gray-800 hover:bg-gray-50 dark:hover:bg-gray-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
        >
          <svg className="mr-2 h-4 w-4 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
          </svg>
          {t('persistence.clearCache')}
        </button>
        <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">
          {t('persistence.clearCacheConfirm')}
        </p>
      </div>
    </div>
  );
};
