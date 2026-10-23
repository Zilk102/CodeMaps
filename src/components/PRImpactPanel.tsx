import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useAnalysisRunner } from '../hooks/useAnalysisRunner';
import {
  ErrorBanner,
  InsetItem,
  PanelCard,
  PanelHeader,
  StatTile,
  TitledListCard,
} from './panels/PanelParts';
import { unwrapResponse } from './panels/panelUtils';
import { getFileStatusDotClass, getRiskColor } from './panels/prImpactUtils';

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

const INPUT_CLASS =
  'w-full rounded-xl border border-(--border) bg-(--bg1) px-3 py-2.5 text-sm text-(--t0) outline-none transition-colors placeholder:text-(--t3) focus:border-(--acc)';

const Spinner: React.FC = () => (
  <svg className="h-4 w-4 animate-spin" fill="none" viewBox="0 0 24 24">
    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
    <path
      className="opacity-75"
      fill="currentColor"
      d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
    />
  </svg>
);

const BranchField: React.FC<{
  label: string;
  value: string;
  placeholder: string;
  onChange: (value: string) => void;
}> = ({ label, value, placeholder, onChange }) => (
  <div className="min-w-0">
    <label className="mb-1 block text-sm font-medium text-(--t1)">{label}</label>
    <input
      type="text"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className={INPUT_CLASS}
      placeholder={placeholder}
    />
  </div>
);

const ChangedFilesList: React.FC<{ files: Record<string, unknown>[] }> = ({ files }) => {
  const { t } = useTranslation();
  return (
    <TitledListCard title={t('prImpact.changedFilesList')}>
      {files.map((file) => (
        <InsetItem key={String(file.path)} className="flex items-center justify-between gap-3">
          <span className="flex min-w-0 items-center gap-2">
            <span className={`h-2 w-2 rounded-full ${getFileStatusDotClass(file.status)}`} />
            <span className="truncate text-sm text-(--t1)">{file.path as string}</span>
          </span>
          <span className="shrink-0 text-xs text-(--t2)">
            +{file.additions as number} -{file.deletions as number}
          </span>
        </InsetItem>
      ))}
    </TitledListCard>
  );
};

const RecommendationsList: React.FC<{ recommendations: string[] }> = ({ recommendations }) => {
  const { t } = useTranslation();
  return (
    <TitledListCard title={t('prImpact.recommendations')}>
      {recommendations.map((rec) => (
        <InsetItem key={rec} className="text-sm text-(--t1)">
          {rec}
        </InsetItem>
      ))}
    </TitledListCard>
  );
};

const PRImpactResultView: React.FC<{ result: PRImpactResult }> = ({ result }) => {
  const { t } = useTranslation();
  return (
    <div className="space-y-4">
      <div
        className={`inline-flex items-center rounded-full px-3 py-1.5 text-sm font-semibold ${getRiskColor(result.riskScore)}`}
      >
        {t(`prImpact.risk.${result.riskScore}`)}
      </div>

      <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
        <StatTile label={t('prImpact.changedFiles')} value={result.changedFiles.length} />
        <StatTile label={t('prImpact.affectedNodes')} value={result.affectedNodes.length} />
        <StatTile label={t('prImpact.blastRadius')} value={result.blastRadius} />
      </div>

      <ChangedFilesList files={result.changedFiles} />

      {result.recommendations.length > 0 && (
        <RecommendationsList recommendations={result.recommendations} />
      )}
    </div>
  );
};

const PRImpactForm: React.FC<{
  baseBranch: string;
  headBranch: string;
  onBaseChange: (value: string) => void;
  onHeadChange: (value: string) => void;
  onAnalyze: () => void;
  isAnalyzing: boolean;
}> = ({ baseBranch, headBranch, onBaseChange, onHeadChange, onAnalyze, isAnalyzing }) => {
  const { t } = useTranslation();
  return (
    <div className="grid grid-cols-1 gap-3 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto]">
      <BranchField
        label={t('prImpact.baseBranch')}
        value={baseBranch}
        placeholder="main"
        onChange={onBaseChange}
      />
      <BranchField
        label={t('prImpact.headBranch')}
        value={headBranch}
        placeholder="HEAD"
        onChange={onHeadChange}
      />
      <div className="flex items-end">
        <button
          type="button"
          onClick={onAnalyze}
          disabled={isAnalyzing}
          className="w-full rounded-xl bg-(--acc) px-4 py-2.5 text-sm font-semibold text-(--bg0) transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50 xl:w-auto"
        >
          {isAnalyzing ? (
            <span className="inline-flex items-center gap-2">
              <Spinner />
              {t('prImpact.analyzing')}
            </span>
          ) : (
            t('prImpact.analyzeButton')
          )}
        </button>
      </div>
    </div>
  );
};

export const PRImpactPanel: React.FC<PRImpactPanelProps> = ({ projectPath }) => {
  const { t } = useTranslation();
  const [baseBranch, setBaseBranch] = useState('main');
  const [headBranch, setHeadBranch] = useState('HEAD');
  const { isRunning: isAnalyzing, result, error, run } = useAnalysisRunner<PRImpactResult>();

  const handleAnalyze = () =>
    run(async () => {
      if (!window.api?.analyzePRImpact) {
        throw new Error('PR Impact analysis not available');
      }
      const response = await window.api.analyzePRImpact(projectPath, baseBranch, headBranch);
      return unwrapResponse<PRImpactResult>(response);
    }, t('prImpact.error'));

  return (
    <div className="space-y-4 p-4">
      <PanelHeader
        eyebrow={t('tools.quickActions.review')}
        title={t('prImpact.title')}
        description={t('tools.quickActions.prDescription')}
      />

      <PanelCard className="p-4">
        <PRImpactForm
          baseBranch={baseBranch}
          headBranch={headBranch}
          onBaseChange={setBaseBranch}
          onHeadChange={setHeadBranch}
          onAnalyze={handleAnalyze}
          isAnalyzing={isAnalyzing}
        />
      </PanelCard>

      {error && (
        <ErrorBanner className="p-4">
          <h4 className="text-sm font-semibold text-(--red)">{t('prImpact.error')}</h4>
          <div className="mt-2 text-sm text-(--red)">{error}</div>
        </ErrorBanner>
      )}

      {result && <PRImpactResultView result={result} />}
    </div>
  );
};
