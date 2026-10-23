import React from 'react';
import { useTranslation } from 'react-i18next';
import { PanelCard } from './PanelParts';

export interface DecompositionCandidate {
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

export interface DecompositionResult {
  summary: {
    candidateCount: number;
    highPriorityCount: number;
    focusAreas: string[];
  };
  candidates: DecompositionCandidate[];
}

const BADGE_BASE = 'rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider';

export function priorityBadgeClass(priority: DecompositionCandidate['priority']): string {
  return priority === 'high'
    ? 'bg-[rgba(255,107,107,0.15)] text-(--red) border border-[rgba(255,107,107,0.3)]'
    : 'bg-[rgba(255,170,0,0.15)] text-[rgb(255,170,0)] border border-[rgba(255,170,0,0.3)]';
}

const EvidenceList: React.FC<{ evidence: string[] }> = ({ evidence }) => {
  const { t } = useTranslation();
  return (
    <div className="rounded-xl border border-(--border) bg-(--bg1) p-3">
      <div className="text-[11px] font-semibold uppercase tracking-widest text-(--t3) mb-2">
        {t('decomposition.evidence')}
      </div>
      <ul className="list-disc pl-4 space-y-1">
        {evidence.map((ev, i) => (
          <li key={i} className="text-[12px] text-(--t2) font-mono">
            {ev}
          </li>
        ))}
      </ul>
    </div>
  );
};

const MetricChips: React.FC<{ metrics: DecompositionCandidate['metrics'] }> = ({ metrics }) => {
  const { t } = useTranslation();
  return (
    <div className="flex flex-wrap gap-2 mt-1">
      {Object.entries(metrics).map(([key, value]) => {
        if (value === undefined || value === null) return null;
        return (
          <div
            key={key}
            className="flex items-center gap-1.5 rounded-lg border border-(--border) bg-[rgba(255,255,255,0.02)] px-2.5 py-1"
          >
            <span className="text-[11px] text-(--t3)">{t(`decomposition.metrics.${key}`)}</span>
            <span className="text-[12px] font-semibold text-(--t1)">{value}</span>
          </div>
        );
      })}
    </div>
  );
};

export const DecompositionCandidateCard: React.FC<{ candidate: DecompositionCandidate }> = ({
  candidate,
}) => {
  const { t } = useTranslation();
  return (
    <PanelCard className="p-4 flex flex-col gap-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className={`${BADGE_BASE} ${priorityBadgeClass(candidate.priority)}`}>
              {t(`decomposition.priority.${candidate.priority}`)}
            </span>
            <span
              className={`${BADGE_BASE} bg-[rgba(255,255,255,0.05)] border border-(--border) text-(--t2)`}
            >
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
        <EvidenceList evidence={candidate.evidence} />
      )}

      {candidate.metrics && <MetricChips metrics={candidate.metrics} />}
    </PanelCard>
  );
};
