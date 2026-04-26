import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';

interface BlastRadiusV2PanelProps {
  projectPath: string;
}

export const BlastRadiusV2Panel: React.FC<BlastRadiusV2PanelProps> = ({ projectPath }) => {
  const { t } = useTranslation();
  const [nodeId, setNodeId] = useState('');
  const [maxDepth, setMaxDepth] = useState(5);
  const [isCalculating, setIsCalculating] = useState(false);
  const [result, setResult] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);

  const handleCalculate = async () => {
    if (!nodeId.trim()) return;
    
    setIsCalculating(true);
    setError(null);

    try {
      if (window.api?.calculateBlastRadius) {
        const response = await window.api.calculateBlastRadius(projectPath, nodeId, maxDepth);
        if (response.success && response.data) {
          setResult(response.data);
        } else {
          throw new Error(response.error || 'Unknown error');
        }
      } else {
        throw new Error('Blast Radius v2 not available');
      }
    } catch (err: any) {
      setError(err.message || t('blastRadius.error'));
    } finally {
      setIsCalculating(false);
    }
  };

  return (
    <div className="space-y-4 p-4">
      <h3 className="text-lg font-medium text-gray-900 dark:text-white">
        {t('blastRadius.title')}
      </h3>

      <div className="flex gap-2">
        <input
          type="text"
          value={nodeId}
          onChange={(e) => setNodeId(e.target.value)}
          placeholder={t('blastRadius.nodeIdPlaceholder')}
          className="flex-1 px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md text-sm focus:ring-blue-500 focus:border-blue-500 dark:bg-gray-700 dark:text-white"
        />
        <select
          value={maxDepth}
          onChange={(e) => setMaxDepth(parseInt(e.target.value))}
          className="w-24 px-2 py-2 border border-gray-300 dark:border-gray-600 rounded-md text-sm dark:bg-gray-700 dark:text-white"
        >
          <option value={3}>3 {t('blastRadius.depth')}</option>
          <option value={5}>5 {t('blastRadius.depth')}</option>
          <option value={10}>10 {t('blastRadius.depth')}</option>
        </select>
        
        <button
          onClick={handleCalculate}
          disabled={isCalculating || !nodeId.trim()}
          className="px-4 py-2 bg-blue-600 text-white rounded-md text-sm font-medium hover:bg-blue-700 disabled:opacity-50"
        >
          {isCalculating ? t('blastRadius.calculating') : t('blastRadius.calculate')}
        </button>
      </div>

      {error && (
        <div className="text-sm text-red-600 dark:text-red-400">{error}</div>
      )}

      {result && (
        <div className="space-y-3">
          <div className="grid grid-cols-3 gap-4">
            <div className="bg-gray-50 dark:bg-gray-800 rounded-lg p-3">
              <div className="text-2xl font-bold">{result.totalAffected}</div>
              <div className="text-xs text-gray-500">{t('blastRadius.totalAffected')}</div>
            </div>
            <div className="bg-gray-50 dark:bg-gray-800 rounded-lg p-3">
              <div className="text-2xl font-bold">{result.directDependencies.length}</div>
              <div className="text-xs text-gray-500">{t('blastRadius.direct')}</div>
            </div>
            <div className="bg-gray-50 dark:bg-gray-800 rounded-lg p-3">
              <div className="text-2xl font-bold">{result.transitiveDependencies.length}</div>
              <div className="text-xs text-gray-500">{t('blastRadius.transitive')}</div>
            </div>
          </div>

          {result.riskPaths.length > 0 && (
            <div>
              <h4 className="text-sm font-medium mb-2">{t('blastRadius.riskPaths')}</h4>
              <ul className="space-y-1">
                {result.riskPaths.map((path: string[], i: number) => (
                  <li key={i} className="text-xs font-mono bg-gray-100 dark:bg-gray-800 p-2 rounded">
                    {path.join(' → ')}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
