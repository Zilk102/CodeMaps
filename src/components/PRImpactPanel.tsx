import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';

interface PRImpactPanelProps {
  projectPath: string;
}

interface PRImpactResult {
  riskScore: string;
  changedFiles: Record<string, unknown>[];
  affectedNodes: unknown[];
  blastRadius: number;
  recommendations: string[];
}

export const PRImpactPanel: React.FC<PRImpactPanelProps> = ({
  projectPath,
}) => {
  const { t } = useTranslation();
  const [baseBranch, setBaseBranch] = useState('main');
  const [headBranch, setHeadBranch] = useState('HEAD');
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [result, setResult] = useState<PRImpactResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleAnalyze = async () => {
    setIsAnalyzing(true);
    setError(null);
    
    try {
      if (window.api?.analyzePRImpact) {
        const response = await window.api.analyzePRImpact(projectPath, baseBranch, headBranch);
        if (response.success && response.data) {
          setResult(response.data as PRImpactResult);
        } else {
          throw new Error(response.error || 'Unknown error');
        }
      } else {
        throw new Error('PR Impact analysis not available');
      }
    } catch (err: unknown) {
      if (err instanceof Error) {
        setError(err.message || t('prImpact.error'));
      } else {
        setError(t('prImpact.error'));
      }
    } finally {
      setIsAnalyzing(false);
    }
  };

  const getRiskColor = (risk: string) => {
    switch (risk) {
      case 'critical': return 'bg-[rgba(255,107,107,0.16)] text-(--red)';
      case 'high': return 'bg-[rgba(255,170,68,0.18)] text-(--orange)';
      case 'medium': return 'bg-[rgba(255,210,102,0.18)] text-(--yellow)';
      case 'low': return 'bg-[rgba(64,201,114,0.18)] text-(--green)';
      default: return 'bg-(--bg2) text-(--t1)';
    }
  };

  return (
    <div className="space-y-4 p-4">
      <div className="rounded-2xl border border-(--border) bg-(--bg2) p-4">
        <div className="text-[12px] font-semibold uppercase tracking-[0.12em] text-(--t3)">
          {t('tools.quickActions.review')}
        </div>
        <h3 className="mt-2 text-[16px] font-semibold text-(--t0)">{t('prImpact.title')}</h3>
        <p className="mt-2 text-[13px] leading-6 text-(--t2)">{t('tools.quickActions.prDescription')}</p>
      </div>

      <div className="rounded-2xl border border-(--border) bg-(--bg2) p-4">
        <div className="grid grid-cols-1 gap-3 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto]">
          <div className="min-w-0">
            <label className="mb-1 block text-sm font-medium text-(--t1)">
              {t('prImpact.baseBranch')}
            </label>
            <input
              type="text"
              value={baseBranch}
              onChange={(e) => setBaseBranch(e.target.value)}
              className="w-full rounded-xl border border-(--border) bg-(--bg1) px-3 py-2.5 text-sm text-(--t0) outline-none transition-colors placeholder:text-(--t3) focus:border-(--acc)"
              placeholder="main"
            />
          </div>
          <div className="min-w-0">
            <label className="mb-1 block text-sm font-medium text-(--t1)">
              {t('prImpact.headBranch')}
            </label>
            <input
              type="text"
              value={headBranch}
              onChange={(e) => setHeadBranch(e.target.value)}
              className="w-full rounded-xl border border-(--border) bg-(--bg1) px-3 py-2.5 text-sm text-(--t0) outline-none transition-colors placeholder:text-(--t3) focus:border-(--acc)"
              placeholder="HEAD"
            />
          </div>
          <div className="flex items-end">
            <button
              type="button"
              onClick={handleAnalyze}
              disabled={isAnalyzing}
              className="w-full rounded-xl bg-(--acc) px-4 py-2.5 text-sm font-semibold text-(--bg0) transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50 xl:w-auto"
            >
              {isAnalyzing ? (
                <span className="inline-flex items-center gap-2">
                  <svg className="h-4 w-4 animate-spin" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                  </svg>
                  {t('prImpact.analyzing')}
                </span>
              ) : (
                t('prImpact.analyzeButton')
              )}
            </button>
          </div>
        </div>
      </div>

      {error && (
        <div className="rounded-2xl border border-[rgba(255,107,107,0.35)] bg-[rgba(255,107,107,0.08)] p-4">
          <h4 className="text-sm font-semibold text-(--red)">{t('prImpact.error')}</h4>
          <div className="mt-2 text-sm text-(--red)">{error}</div>
        </div>
      )}

      {result && (
        <div className="space-y-4">
          <div className={`inline-flex items-center rounded-full px-3 py-1.5 text-sm font-semibold ${getRiskColor(result.riskScore)}`}>
            {t(`prImpact.risk.${result.riskScore}`)}
          </div>

          <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
            <div className="rounded-2xl border border-(--border) bg-(--bg2) p-4">
              <div className="text-[11px] uppercase tracking-[0.08em] text-(--t3)">
                {t('prImpact.changedFiles')}
              </div>
              <div className="mt-2 text-[24px] font-semibold text-(--t0)">
                {result.changedFiles.length}
              </div>
            </div>
            <div className="rounded-2xl border border-(--border) bg-(--bg2) p-4">
              <div className="text-[11px] uppercase tracking-[0.08em] text-(--t3)">
                {t('prImpact.affectedNodes')}
              </div>
              <div className="mt-2 text-[24px] font-semibold text-(--t0)">
                {result.affectedNodes.length}
              </div>
            </div>
            <div className="rounded-2xl border border-(--border) bg-(--bg2) p-4">
              <div className="text-[11px] uppercase tracking-[0.08em] text-(--t3)">
                {t('prImpact.blastRadius')}
              </div>
              <div className="mt-2 text-[24px] font-semibold text-(--t0)">
                {result.blastRadius}
              </div>
            </div>
          </div>

          <div className="rounded-2xl border border-(--border) bg-(--bg2) p-4">
            <h4 className="text-[13px] font-semibold text-(--t0)">
              {t('prImpact.changedFilesList')}
            </h4>
            <ul className="mt-3 space-y-2">
              {result.changedFiles.map((file: Record<string, unknown>, index: number) => (
                <li
                  key={index}
                  className="flex items-center justify-between gap-3 rounded-xl border border-(--border) bg-(--bg1) px-3 py-2"
                >
                  <span className="flex min-w-0 items-center gap-2">
                    <span
                      className={`h-2 w-2 rounded-full ${
                        file.status === 'added'
                          ? 'bg-(--green)'
                          : file.status === 'deleted'
                            ? 'bg-(--red)'
                            : 'bg-(--yellow)'
                      }`}
                    />
                    <span className="truncate text-sm text-(--t1)">{file.path as string}</span>
                  </span>
                  <span className="shrink-0 text-xs text-(--t2)">
                    +{(file.additions as number)} -{(file.deletions as number)}
                  </span>
                </li>
              ))}
            </ul>
          </div>

          {result.recommendations.length > 0 && (
            <div className="rounded-2xl border border-(--border) bg-(--bg2) p-4">
              <h4 className="text-[13px] font-semibold text-(--t0)">
                {t('prImpact.recommendations')}
              </h4>
              <ul className="mt-3 space-y-2">
                {result.recommendations.map((rec: string, index: number) => (
                  <li
                    key={index}
                    className="rounded-xl border border-(--border) bg-(--bg1) px-3 py-2 text-sm text-(--t1)"
                  >
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

