import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useGraphStore } from '../store/useStore';
import { useAnalysisRunner } from '../hooks/useAnalysisRunner';
import {
  DecompositionCandidateCard,
  type DecompositionResult,
} from './panels/DecompositionCandidateCard';
import { NodePanelFrame } from './panels/NodePanelFrame';
import { PanelCard, StatTile } from './panels/PanelParts';
import { unwrapResponse } from './panels/panelUtils';

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

const DecompositionResultView: React.FC<{ result: DecompositionResult }> = ({ result }) => {
  const { t } = useTranslation();
  return (
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
  );
};

const requestDecomposition = async (
  projectPath: string,
  focusNodeId: string
): Promise<DecompositionResult> => {
  if (!window.api?.analyzeDecomposition) {
    throw new Error('Decomposition Wizard not available in IPC');
  }
  const response = await window.api.analyzeDecomposition(
    projectPath,
    focusNodeId.trim() ? [focusNodeId.trim()] : undefined
  );
  return unwrapResponse<DecompositionResult>(response);
};

export const DecompositionWizardPanel: React.FC<DecompositionWizardPanelProps> = ({
  projectPath,
}) => {
  const { t } = useTranslation();
  const { selectedNode } = useGraphStore();
  const [focusNodeId, setFocusNodeId] = useState('');
  const { isRunning: isAnalyzing, result, error, run } = useAnalysisRunner<DecompositionResult>();

  const handleAnalyze = () =>
    run(() => requestDecomposition(projectPath, focusNodeId), t('decomposition.error'));

  return (
    <NodePanelFrame
      eyebrow={t('tools.quickActions.refactoring')}
      title={t('decomposition.title')}
      description={t('tools.quickActions.decompositionActionDescription')}
      nodeLabel={t('decomposition.focusNode')}
      selectedNode={selectedNode}
      onUseSelected={setFocusNodeId}
      error={error}
      controls={
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
      }
    >
      {result && <DecompositionResultView result={result} />}
    </NodePanelFrame>
  );
};
