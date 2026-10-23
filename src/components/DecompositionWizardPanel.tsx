import React, { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useGraphStore } from '../store/useStore';
import { useAnalysisRunner } from '../hooks/useAnalysisRunner';
import {
  DecompositionCandidateCard,
  type DecompositionResult,
} from './panels/DecompositionCandidateCard';
import {
  ErrorBanner,
  PanelCard,
  PanelHeader,
  SelectedNodeBar,
  StatTile,
} from './panels/PanelParts';
import { describeNode, unwrapResponse } from './panels/panelUtils';

interface DecompositionWizardPanelProps {
  projectPath: string;
}

const CandidateList: React.FC<{ result: DecompositionResult }> = ({ result }) => {
  const { t } = useTranslation();
  return (
    <div className="space-y-3">
      <h4 className="text-[13px] font-semibold uppercase tracking-widest text-(--t3) ml-1">
        {t('decomposition.candidates')}
      </h4>
      {result.candidates.length > 0 ? (
        result.candidates.map((candidate, idx) => (
          <DecompositionCandidateCard
            key={`${candidate.targetNodeId}-${idx}`}
            candidate={candidate}
          />
        ))
      ) : (
        <PanelCard className="p-6 text-center text-(--t2) text-[13px]">
          {t('blastRadius.noRiskPaths')}
        </PanelCard>
      )}
    </div>
  );
};

export const DecompositionWizardPanel: React.FC<DecompositionWizardPanelProps> = ({
  projectPath,
}) => {
  const { t } = useTranslation();
  const { selectedNode } = useGraphStore();
  const [focusNodeId, setFocusNodeId] = useState('');
  const { isRunning: isAnalyzing, result, error, run } = useAnalysisRunner<DecompositionResult>();

  const handleAnalyze = () =>
    run(async () => {
      if (!window.api?.analyzeDecomposition) {
        throw new Error('Decomposition Wizard not available in IPC');
      }
      const response = await window.api.analyzeDecomposition(
        projectPath,
        focusNodeId.trim() ? [focusNodeId.trim()] : undefined
      );
      return unwrapResponse<DecompositionResult>(response);
    }, t('decomposition.error'));

  const selectedNodeSummary = useMemo(() => describeNode(selectedNode), [selectedNode]);

  return (
    <div className="space-y-4 p-4">
      <PanelHeader
        eyebrow={t('tools.quickActions.refactoring')}
        title={t('decomposition.title')}
        description={t('tools.quickActions.decompositionActionDescription')}
      />

      <PanelCard className="p-4">
        <div className="flex flex-col gap-3">
          <SelectedNodeBar
            label={t('decomposition.focusNode')}
            selectedLabel={t('blastRadius.selectedNode')}
            useSelectedLabel={t('blastRadius.useSelected')}
            hasSelection={!!selectedNode}
            summary={selectedNodeSummary}
            onUseSelected={() => selectedNode && setFocusNodeId(selectedNode.id)}
          />

          <div className="flex flex-col gap-2 xl:flex-row">
            <input
              type="text"
              value={focusNodeId}
              onChange={(e) => setFocusNodeId(e.target.value)}
              placeholder={t('decomposition.nodePlaceholder')}
              className="min-w-0 flex-1 rounded-xl border border-(--border) bg-(--bg1) px-3 py-2.5 text-sm text-(--t0) outline-none transition-colors placeholder:text-(--t3) focus:border-(--acc)"
            />
            <button
              type="button"
              onClick={handleAnalyze}
              disabled={isAnalyzing}
              className="rounded-xl bg-(--acc) px-4 py-2.5 text-sm font-semibold text-(--bg0) transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {isAnalyzing ? t('decomposition.analyzing') : t('decomposition.analyze')}
            </button>
          </div>
        </div>
      </PanelCard>

      {error && <ErrorBanner className="px-4 py-3 text-sm text-(--red)">{error}</ErrorBanner>}

      {result && (
        <div className="space-y-4">
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            <StatTile
              label={t('decomposition.candidatesCount')}
              value={result.summary.candidateCount}
            />
            <StatTile
              label={t('decomposition.highPriority')}
              value={result.summary.highPriorityCount}
              valueClassName="text-(--red)"
            />
          </div>

          <CandidateList result={result} />
        </div>
      )}
    </div>
  );
};
