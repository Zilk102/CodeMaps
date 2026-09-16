import React, { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useGraphStore } from '../store/useStore';

interface DecompositionWizardPanelProps {
  projectPath: string;
}

interface DecompositionCandidate {
  fileNodeId: string;
  targetNodeId: string;
  targetType: 'module' | 'class' | 'method';
  targetLabel: string;
  action:
    | 'extract_module'
    | 'split_responsibilities'
    | 'extract_class'
    | 'extract_method'
    | 'reduce_complexity';
  priority: 'high' | 'medium';
  score: number;
  reason: string;
  evidence: string[];
  lineRange?: {
    startLine: number;
    endLine: number;
  };
  metrics: {
    lineCount?: number;
    complexity?: number;
    branchCount?: number;
    maxNesting?: number;
    methodCount?: number;
    publicMethodCount?: number;
    designSmellScore?: number;
    responsibilityAxisCount?: number;
  };
}

interface DecompositionResult {
  summary: {
    candidateCount: number;
    highPriorityCount: number;
    focusAreas: string[];
  };
  candidates: DecompositionCandidate[];
}

export const DecompositionWizardPanel: React.FC<DecompositionWizardPanelProps> = ({
  projectPath,
}) => {
  const { t } = useTranslation();
  const { selectedNode } = useGraphStore();
  const [focusNodeId, setFocusNodeId] = useState('');
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [result, setResult] = useState<DecompositionResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleAnalyze = async () => {
    setIsAnalyzing(true);
    setError(null);

    try {
      if (window.api?.analyzeDecomposition) {
        const response = await window.api.analyzeDecomposition(
          projectPath,
          focusNodeId.trim() ? [focusNodeId.trim()] : undefined
        );
        if (response.success && response.data) {
          setResult(response.data as DecompositionResult);
        } else {
          throw new Error(response.error || 'Unknown error');
        }
      } else {
        throw new Error('Decomposition Wizard not available in IPC');
      }
    } catch (err: unknown) {
      if (err instanceof Error) {
        setError(err.message || t('decomposition.error'));
      } else {
        setError(t('decomposition.error'));
      }
    } finally {
      setIsAnalyzing(false);
    }
  };

  const selectedNodeSummary = useMemo(() => {
    if (!selectedNode) return null;
    return `${selectedNode.label} · ${selectedNode.type}`;
  }, [selectedNode]);

  return (
    <div className="space-y-4 p-4">
      <div className="rounded-2xl border border-(--border) bg-(--bg2) p-4">
        <div className="text-[12px] font-semibold uppercase tracking-[0.12em] text-(--t3)">
          {t('tools.quickActions.refactoring')}
        </div>
        <h3 className="mt-2 text-[16px] font-semibold text-(--t0)">{t('decomposition.title')}</h3>
        <p className="mt-2 text-[13px] leading-6 text-(--t2)">
          {t('tools.quickActions.decompositionActionDescription')}
        </p>
      </div>

      <div className="rounded-2xl border border-(--border) bg-(--bg2) p-4">
        <div className="flex flex-col gap-3">
          <div className="flex items-center justify-between gap-3">
            <div className="text-[12px] font-semibold uppercase tracking-[0.12em] text-(--t3)">
              {t('decomposition.focusNode')}
            </div>
            {selectedNode && (
              <button
                type="button"
                onClick={() => setFocusNodeId(selectedNode.id)}
                className="rounded-lg border border-(--border) bg-(--bg1) px-3 py-1.5 text-[12px] font-medium text-(--t1) transition-colors hover:border-(--acc) hover:text-(--acc)"
              >
                {t('blastRadius.useSelected')}
              </button>
            )}
          </div>

          {selectedNodeSummary && (
            <div className="rounded-xl border border-(--border) bg-(--bg1) px-3 py-2">
              <div className="text-[11px] text-(--t3)">{t('blastRadius.selectedNode')}</div>
              <div className="mt-1 text-[13px] font-medium text-(--t0)">{selectedNodeSummary}</div>
            </div>
          )}

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
      </div>

      {error && (
        <div className="rounded-2xl border border-[rgba(255,107,107,0.35)] bg-[rgba(255,107,107,0.08)] px-4 py-3 text-sm text-(--red)">
          {error}
        </div>
      )}

      {result && (
        <div className="space-y-4">
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            <div className="rounded-2xl border border-(--border) bg-(--bg2) p-4">
              <div className="text-[11px] uppercase tracking-[0.08em] text-(--t3)">
                {t('decomposition.candidatesCount')}
              </div>
              <div className="mt-2 text-[24px] font-semibold text-(--t0)">
                {result.summary.candidateCount}
              </div>
            </div>
            <div className="rounded-2xl border border-(--border) bg-(--bg2) p-4">
              <div className="text-[11px] uppercase tracking-[0.08em] text-(--t3)">
                {t('decomposition.highPriority')}
              </div>
              <div className="mt-2 text-[24px] font-semibold text-(--red)">
                {result.summary.highPriorityCount}
              </div>
            </div>
          </div>

          <div className="space-y-3">
            <h4 className="text-[13px] font-semibold uppercase tracking-[0.1em] text-(--t3) ml-1">
              {t('decomposition.candidates')}
            </h4>
            {result.candidates.length > 0 ? (
              result.candidates.map((candidate, idx) => (
                <div
                  key={`${candidate.targetNodeId}-${idx}`}
                  className="rounded-2xl border border-(--border) bg-(--bg2) p-4 flex flex-col gap-3"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span
                          className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider ${
                            candidate.priority === 'high'
                              ? 'bg-[rgba(255,107,107,0.15)] text-(--red) border border-[rgba(255,107,107,0.3)]'
                              : 'bg-[rgba(255,170,0,0.15)] text-[rgb(255,170,0)] border border-[rgba(255,170,0,0.3)]'
                          }`}
                        >
                          {t(`decomposition.priority.${candidate.priority}`)}
                        </span>
                        <span className="rounded-full bg-[rgba(255,255,255,0.05)] border border-(--border) px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-(--t2)">
                          {t(`decomposition.actions.${candidate.action}`)}
                        </span>
                      </div>
                      <div className="mt-2 text-[14px] font-semibold text-(--t0) break-all">
                        {candidate.targetLabel}
                      </div>
                      <div className="mt-1 text-[12px] text-(--t3) font-mono break-all">
                        {candidate.targetNodeId}
                      </div>
                    </div>
                  </div>

                  <div className="text-[13px] leading-5 text-(--t2)">
                    <span className="font-semibold text-(--t1)">{t('decomposition.reason')}: </span>
                    {candidate.reason}
                  </div>

                  {candidate.evidence && candidate.evidence.length > 0 && (
                    <div className="rounded-xl border border-(--border) bg-(--bg1) p-3">
                      <div className="text-[11px] font-semibold uppercase tracking-[0.1em] text-(--t3) mb-2">
                        {t('decomposition.evidence')}
                      </div>
                      <ul className="list-disc pl-4 space-y-1">
                        {candidate.evidence.map((ev, i) => (
                          <li key={i} className="text-[12px] text-(--t2) font-mono">
                            {ev}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {candidate.metrics && (
                    <div className="flex flex-wrap gap-2 mt-1">
                      {Object.entries(candidate.metrics).map(([key, value]) => {
                        if (value === undefined || value === null) return null;
                        return (
                          <div
                            key={key}
                            className="flex items-center gap-1.5 rounded-lg border border-(--border) bg-[rgba(255,255,255,0.02)] px-2.5 py-1"
                          >
                            <span className="text-[11px] text-(--t3)">
                              {t(`decomposition.metrics.${key}`)}
                            </span>
                            <span className="text-[12px] font-semibold text-(--t1)">{value}</span>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              ))
            ) : (
              <div className="rounded-2xl border border-(--border) bg-(--bg2) p-6 text-center text-(--t2) text-[13px]">
                {t('blastRadius.noRiskPaths')} {/* Reuse string or add new one */}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
