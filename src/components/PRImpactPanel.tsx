import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';

interface PRImpactPanelProps {
  projectPath: string;
  onAnalyze?: (baseBranch: string, headBranch: string) => void;
}

export const PRImpactPanel: React.FC<PRImpactPanelProps> = ({
  projectPath,
  onAnalyze,
}) => {
  const { t } = useTranslation();
  const [baseBranch, setBaseBranch] = useState('main');
  const [headBranch, setHeadBranch] = useState('HEAD');
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [result, setResult] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);

  const handleAnalyze = async () => {
    setIsAnalyzing(true);
    setError(null);
    
    try {
      if (window.api?.analyzePRImpact) {
        const data = await window.api.analyzePRImpact(projectPath, baseBranch, headBranch);
        setResult(data);
      } else {
        throw new Error('PR Impact analysis not available');
      }
    } catch (err: any) {
      setError(err.message || t('prImpact.error'));
    } finally {
      setIsAnalyzing(false);
    }
  };

  const getRiskColor = (risk: string) => {
    switch (risk) {
      case 'critical': return 'bg-red-600 text-white';
      case 'high': return 'bg-orange-500 text-white';
      case 'medium': return 'bg-yellow-500 text-black';
      case 'low': return 'bg-green-500 text-white';
      default: return 'bg-gray-500 text-white';
    }
  };

  return (
    <div className="space-y-4 p-4">
      <h3 className="text-lg font-medium text-gray-900 dark:text-white">
        {t('prImpact.title')}
      </h3>
      
      <div className="flex gap-2">
        <div className="flex-1">
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
            {t('prImpact.baseBranch')}
          </label>
          <input
            type="text"
            value={baseBranch}
            onChange={(e) => setBaseBranch(e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm text-sm focus:ring-blue-500 focus:border-blue-500 dark:bg-gray-700 dark:text-white"
            placeholder="main"
          />
        </div>
        <div className="flex-1">
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
            {t('prImpact.headBranch')}
          </label>
          <input
            type="text"
            value={headBranch}
            onChange={(e) => setHeadBranch(e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm text-sm focus:ring-blue-500 focus:border-blue-500 dark:bg-gray-700 dark:text-white"
            placeholder="HEAD"
          />
        </div>
      </div>

      <button
        onClick={handleAnalyze}
        disabled={isAnalyzing}
        className="w-full inline-flex justify-center items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {isAnalyzing ? (
          <>
            <svg className="animate-spin -ml-1 mr-3 h-4 w-4 text-white" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
            </svg>
            {t('prImpact.analyzing')}
          </>
        ) : (
          t('prImpact.analyzeButton')
        )}
      </button>

      {error && (
        <div className="rounded-md bg-red-50 dark:bg-red-900/20 p-4">
          <div className="flex">
            <div className="ml-3">
              <h3 className="text-sm font-medium text-red-800 dark:text-red-200">
                {t('prImpact.error')}
              </h3>
              <div className="mt-2 text-sm text-red-700 dark:text-red-300">
                {error}
              </div>
            </div>
          </div>
        </div>
      )}

      {result && (
        <div className="space-y-4">
          {/* Risk Score */}
          <div className={`inline-flex items-center px-3 py-1 rounded-full text-sm font-medium ${getRiskColor(result.riskScore)}`}>
            {t(`prImpact.risk.${result.riskScore}`)}
          </div>

          {/* Stats */}
          <div className="grid grid-cols-3 gap-4">
            <div className="bg-gray-50 dark:bg-gray-800 rounded-lg p-3">
              <div className="text-2xl font-bold text-gray-900 dark:text-white">
                {result.changedFiles.length}
              </div>
              <div className="text-xs text-gray-500 dark:text-gray-400">
                {t('prImpact.changedFiles')}
              </div>
            </div>
            <div className="bg-gray-50 dark:bg-gray-800 rounded-lg p-3">
              <div className="text-2xl font-bold text-gray-900 dark:text-white">
                {result.affectedNodes.length}
              </div>
              <div className="text-xs text-gray-500 dark:text-gray-400">
                {t('prImpact.affectedNodes')}
              </div>
            </div>
            <div className="bg-gray-50 dark:bg-gray-800 rounded-lg p-3">
              <div className="text-2xl font-bold text-gray-900 dark:text-white">
                {result.blastRadius}
              </div>
              <div className="text-xs text-gray-500 dark:text-gray-400">
                {t('prImpact.blastRadius')}
              </div>
            </div>
          </div>

          {/* Changed Files */}
          <div>
            <h4 className="text-sm font-medium text-gray-900 dark:text-white mb-2">
              {t('prImpact.changedFilesList')}
            </h4>
            <ul className="space-y-1">
              {result.changedFiles.map((file: any, index: number) => (
                <li key={index} className="flex items-center justify-between text-sm">
                  <span className="flex items-center gap-2">
                    <span className={`w-2 h-2 rounded-full ${
                      file.status === 'added' ? 'bg-green-500' :
                      file.status === 'deleted' ? 'bg-red-500' :
                      'bg-yellow-500'
                    }`} />
                    <span className="text-gray-700 dark:text-gray-300">{file.path}</span>
                  </span>
                  <span className="text-gray-500 text-xs">
                    +{file.additions} -{file.deletions}
                  </span>
                </li>
              ))}
            </ul>
          </div>

          {/* Recommendations */}
          {result.recommendations.length > 0 && (
            <div>
              <h4 className="text-sm font-medium text-gray-900 dark:text-white mb-2">
                {t('prImpact.recommendations')}
              </h4>
              <ul className="space-y-1">
                {result.recommendations.map((rec: string, index: number) => (
                  <li key={index} className="text-sm text-gray-600 dark:text-gray-400">
                    {rec}
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
