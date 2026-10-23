import React, { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useGraphStore } from '../store/useStore';
import { useAnalysisRunner } from '../hooks/useAnalysisRunner';
import {
  ErrorBanner,
  PanelCard,
  PanelHeader,
  SelectedNodeBar,
  StatTile,
} from './panels/PanelParts';
import { describeNode, unwrapResponse } from './panels/panelUtils';

interface BlastRadiusV2PanelProps {
  projectPath: string;
}

interface BlastRadiusResult {
  totalAffected: number;
  directDependencies: unknown[];
  transitiveDependencies: unknown[];
  riskPaths: string[][];
}

const BlastRadiusResultView: React.FC<{ result: BlastRadiusResult }> = ({ result }) => {
  const { t } = useTranslation();
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
        <StatTile label={t('blastRadius.totalAffected')} value={result.totalAffected} />
        <StatTile label={t('blastRadius.direct')} value={result.directDependencies.length} />
        <StatTile
          label={t('blastRadius.transitive')}
          value={result.transitiveDependencies.length}
        />
      </div>

      <PanelCard className="p-4">
        <h4 className="text-[13px] font-semibold text-(--t0)">{t('blastRadius.riskPaths')}</h4>
        {result.riskPaths.length > 0 ? (
          <ul className="mt-3 space-y-2">
            {result.riskPaths.map((path: string[]) => (
              <li
                key={path.join('>')}
                className="overflow-x-auto rounded-xl border border-(--border) bg-(--bg1) px-3 py-2 text-xs font-mono text-(--t1)"
              >
                {path.join(' → ')}
              </li>
            ))}
          </ul>
        ) : (
          <div className="mt-3 text-[13px] text-(--t2)">{t('blastRadius.noRiskPaths')}</div>
        )}
      </PanelCard>
    </div>
  );
};

interface ControlsProps {
  nodeId: string;
  onNodeIdChange: (value: string) => void;
  placeholder: string;
  maxDepth: number;
  onMaxDepthChange: (value: number) => void;
  onCalculate: () => void;
  isCalculating: boolean;
  canCalculate: boolean;
}

const BlastRadiusControls: React.FC<ControlsProps> = ({
  nodeId,
  onNodeIdChange,
  placeholder,
  maxDepth,
  onMaxDepthChange,
  onCalculate,
  isCalculating,
  canCalculate,
}) => {
  const { t } = useTranslation();
  return (
    <div className="flex flex-col gap-2 xl:flex-row">
      <input
        type="text"
        value={nodeId}
        onChange={(e) => onNodeIdChange(e.target.value)}
        placeholder={placeholder}
        className="min-w-0 flex-1 rounded-xl border border-(--border) bg-(--bg1) px-3 py-2.5 text-sm text-(--t0) outline-none transition-colors placeholder:text-(--t3) focus:border-(--acc)"
      />
      <select
        value={maxDepth}
        onChange={(e) => onMaxDepthChange(parseInt(e.target.value, 10))}
        className="rounded-xl border border-(--border) bg-(--bg1) px-3 py-2.5 text-sm text-(--t0) outline-none transition-colors focus:border-(--acc)"
      >
        <option value={3}>3 {t('blastRadius.depth')}</option>
        <option value={5}>5 {t('blastRadius.depth')}</option>
        <option value={10}>10 {t('blastRadius.depth')}</option>
      </select>
      <button
        type="button"
        onClick={onCalculate}
        disabled={isCalculating || !canCalculate}
        className="rounded-xl bg-(--acc) px-4 py-2.5 text-sm font-semibold text-(--bg0) transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {isCalculating ? t('blastRadius.calculating') : t('blastRadius.calculate')}
      </button>
    </div>
  );
};

const requestBlastRadius = async (
  projectPath: string,
  nodeId: string,
  maxDepth: number
): Promise<BlastRadiusResult> => {
  if (!window.api?.calculateBlastRadius) {
    throw new Error('Blast Radius v2 not available');
  }
  const response = await window.api.calculateBlastRadius(projectPath, nodeId, maxDepth);
  return unwrapResponse<BlastRadiusResult>(response);
};

export const BlastRadiusV2Panel: React.FC<BlastRadiusV2PanelProps> = ({ projectPath }) => {
  const { t } = useTranslation();
  const { selectedNode } = useGraphStore();
  const [nodeId, setNodeId] = useState('');
  const [maxDepth, setMaxDepth] = useState(5);
  const { isRunning: isCalculating, result, error, run } = useAnalysisRunner<BlastRadiusResult>();
  const effectiveNodeId = nodeId.trim() || selectedNode?.id || '';

  const selectedNodeSummary = useMemo(() => describeNode(selectedNode), [selectedNode]);

  const handleCalculate = () => {
    if (!effectiveNodeId) return;

    return run(
      () => requestBlastRadius(projectPath, effectiveNodeId, maxDepth),
      t('blastRadius.error')
    );
  };

  return (
    <div className="space-y-4 p-4">
      <PanelHeader
        eyebrow={t('tools.quickActions.highRisk')}
        title={t('blastRadius.title')}
        description={t('tools.quickActions.blastDescription')}
      />

      <PanelCard className="p-4">
        <div className="flex flex-col gap-3">
          <SelectedNodeBar
            label={t('blastRadius.targetNode')}
            selectedLabel={t('blastRadius.selectedNode')}
            useSelectedLabel={t('blastRadius.useSelected')}
            hasSelection={!!selectedNode}
            summary={selectedNodeSummary}
            onUseSelected={() => selectedNode && setNodeId(selectedNode.id)}
          />

          <BlastRadiusControls
            nodeId={nodeId}
            onNodeIdChange={setNodeId}
            placeholder={selectedNode?.id || t('blastRadius.nodeIdPlaceholder')}
            maxDepth={maxDepth}
            onMaxDepthChange={setMaxDepth}
            onCalculate={handleCalculate}
            isCalculating={isCalculating}
            canCalculate={!!effectiveNodeId}
          />
        </div>
      </PanelCard>

      {error && <ErrorBanner className="px-4 py-3 text-sm text-(--red)">{error}</ErrorBanner>}

      {result && <BlastRadiusResultView result={result} />}
    </div>
  );
};
