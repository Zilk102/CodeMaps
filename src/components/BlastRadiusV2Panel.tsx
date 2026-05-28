import React, { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useGraphStore } from '../store/useStore';

interface BlastRadiusV2PanelProps {
  projectPath: string;
}

interface BlastRadiusResult {
  totalAffected: number;
  directDependencies: unknown[];
  transitiveDependencies: unknown[];
  riskPaths: string[][];
}

export const BlastRadiusV2Panel: React.FC<BlastRadiusV2PanelProps> = ({ projectPath }) => {
  const { t } = useTranslation();
  const { selectedNode } = useGraphStore();
  const [nodeId, setNodeId] = useState('');
  const [maxDepth, setMaxDepth] = useState(5);
  const [isCalculating, setIsCalculating] = useState(false);
  const [result, setResult] = useState<BlastRadiusResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const effectiveNodeId = nodeId.trim() || selectedNode?.id || '';

  const selectedNodeSummary = useMemo(() => {
    if (!selectedNode) {
      return null;
    }

    return `${selectedNode.label} · ${selectedNode.type}`;
  }, [selectedNode]);

  const handleCalculate = async () => {
    if (!effectiveNodeId) return;
    
    setIsCalculating(true);
    setError(null);

    try {
      if (window.api?.calculateBlastRadius) {
        const response = await window.api.calculateBlastRadius(projectPath, effectiveNodeId, maxDepth);
        if (response.success && response.data) {
          setResult(response.data as BlastRadiusResult);
        } else {
          throw new Error(response.error || 'Unknown error');
        }
      } else {
        throw new Error('Blast Radius v2 not available');
      }
    } catch (err: unknown) {
      if (err instanceof Error) {
        setError(err.message || t('blastRadius.error'));
      } else {
        setError(t('blastRadius.error'));
      }
    } finally {
      setIsCalculating(false);
    }
  };

  return (
    <div className="space-y-4 p-4">
      <div className="rounded-2xl border border-(--border) bg-(--bg2) p-4">
        <div className="text-[12px] font-semibold uppercase tracking-[0.12em] text-(--t3)">
          {t('tools.quickActions.highRisk')}
        </div>
        <h3 className="mt-2 text-[16px] font-semibold text-(--t0)">{t('blastRadius.title')}</h3>
        <p className="mt-2 text-[13px] leading-6 text-(--t2)">{t('tools.quickActions.blastDescription')}</p>
      </div>

      <div className="rounded-2xl border border-(--border) bg-(--bg2) p-4">
        <div className="flex flex-col gap-3">
          <div className="flex items-center justify-between gap-3">
            <div className="text-[12px] font-semibold uppercase tracking-[0.12em] text-(--t3)">
              {t('blastRadius.targetNode')}
            </div>
            {selectedNode && (
              <button
                type="button"
                onClick={() => setNodeId(selectedNode.id)}
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
              value={nodeId}
              onChange={(e) => setNodeId(e.target.value)}
              placeholder={selectedNode?.id || t('blastRadius.nodeIdPlaceholder')}
              className="min-w-0 flex-1 rounded-xl border border-(--border) bg-(--bg1) px-3 py-2.5 text-sm text-(--t0) outline-none transition-colors placeholder:text-(--t3) focus:border-(--acc)"
            />
            <select
              value={maxDepth}
              onChange={(e) => setMaxDepth(parseInt(e.target.value, 10))}
              className="rounded-xl border border-(--border) bg-(--bg1) px-3 py-2.5 text-sm text-(--t0) outline-none transition-colors focus:border-(--acc)"
            >
              <option value={3}>3 {t('blastRadius.depth')}</option>
              <option value={5}>5 {t('blastRadius.depth')}</option>
              <option value={10}>10 {t('blastRadius.depth')}</option>
            </select>
            <button
              type="button"
              onClick={handleCalculate}
              disabled={isCalculating || !effectiveNodeId}
              className="rounded-xl bg-(--acc) px-4 py-2.5 text-sm font-semibold text-(--bg0) transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {isCalculating ? t('blastRadius.calculating') : t('blastRadius.calculate')}
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
          <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
            <div className="rounded-2xl border border-(--border) bg-(--bg2) p-4">
              <div className="text-[11px] uppercase tracking-[0.08em] text-(--t3)">{t('blastRadius.totalAffected')}</div>
              <div className="mt-2 text-[24px] font-semibold text-(--t0)">{result.totalAffected}</div>
            </div>
            <div className="rounded-2xl border border-(--border) bg-(--bg2) p-4">
              <div className="text-[11px] uppercase tracking-[0.08em] text-(--t3)">{t('blastRadius.direct')}</div>
              <div className="mt-2 text-[24px] font-semibold text-(--t0)">{result.directDependencies.length}</div>
            </div>
            <div className="rounded-2xl border border-(--border) bg-(--bg2) p-4">
              <div className="text-[11px] uppercase tracking-[0.08em] text-(--t3)">{t('blastRadius.transitive')}</div>
              <div className="mt-2 text-[24px] font-semibold text-(--t0)">{result.transitiveDependencies.length}</div>
            </div>
          </div>

          <div className="rounded-2xl border border-(--border) bg-(--bg2) p-4">
            <h4 className="text-[13px] font-semibold text-(--t0)">{t('blastRadius.riskPaths')}</h4>
            {result.riskPaths.length > 0 ? (
              <ul className="mt-3 space-y-2">
                {result.riskPaths.map((path: string[], i: number) => (
                  <li
                    key={i}
                    className="overflow-x-auto rounded-xl border border-(--border) bg-(--bg1) px-3 py-2 text-xs font-mono text-(--t1)"
                  >
                    {path.join(' → ')}
                  </li>
                ))}
              </ul>
            ) : (
              <div className="mt-3 text-[13px] text-(--t2)">{t('blastRadius.noRiskPaths')}</div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

