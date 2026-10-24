// Panel that shows what a change to one node can affect: counts of direct and indirect dependents
// and the riskiest dependency paths.
import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useGraphStore } from '../store/useStore';
import { useAnalysisRunner } from '../hooks/useAnalysisRunner';
import { NodePanelFrame } from './panels/NodePanelFrame';
import { PanelCard, StatTileGrid } from './panels/PanelParts';
import { unwrapResponse } from './panels/panelUtils';

interface BlastRadiusV2PanelProps {
  projectPath: string;
}

interface BlastRadiusResult {
  totalAffected: number;
  directDependencies: unknown[];
  transitiveDependencies: unknown[];
  riskPaths: string[][];
}

/**
 * Result display: tiles for total, direct and transitive dependents, and the list of risk paths
 * drawn as a chain of node ids.
 */
const BlastRadiusResultView: React.FC<{ result: BlastRadiusResult }> = ({ result }) => {
  const { t } = useTranslation();
  return (
    <div className="space-y-4">
      <StatTileGrid
        tiles={[
          ['blastRadius.totalAffected', result.totalAffected],
          ['blastRadius.direct', result.directDependencies.length],
          ['blastRadius.transitive', result.transitiveDependencies.length],
        ]}
      />

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

/**
 * Input row of the panel: node id field, depth choice (3, 5 or 10) and the Calculate button,
 * disabled while running or when no node is chosen.
 */
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

/**
 * Asks the main process for the blast radius of a node down to a depth, returning the unwrapped
 * result or throwing when the API is missing or reports an error.
 */
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

/**
 * Blast Radius tool tab. It calculates for the node typed by the user, or for the node selected in
 * the graph when the field is empty, and shows the result below.
 */
export const BlastRadiusV2Panel: React.FC<BlastRadiusV2PanelProps> = ({ projectPath }) => {
  const { t } = useTranslation();
  const { selectedNode } = useGraphStore();
  const [nodeId, setNodeId] = useState('');
  const [maxDepth, setMaxDepth] = useState(5);
  const { isRunning: isCalculating, result, error, run } = useAnalysisRunner<BlastRadiusResult>();
  const effectiveNodeId = nodeId.trim() || selectedNode?.id || '';

  const handleCalculate = () => {
    if (!effectiveNodeId) return;

    return run(
      () => requestBlastRadius(projectPath, effectiveNodeId, maxDepth),
      t('blastRadius.error')
    );
  };

  return (
    <NodePanelFrame
      eyebrow={t('tools.quickActions.highRisk')}
      title={t('blastRadius.title')}
      description={t('tools.quickActions.blastDescription')}
      nodeLabel={t('blastRadius.targetNode')}
      selectedNode={selectedNode}
      onUseSelected={setNodeId}
      error={error}
      controls={
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
      }
    >
      {result && <BlastRadiusResultView result={result} />}
    </NodePanelFrame>
  );
};
