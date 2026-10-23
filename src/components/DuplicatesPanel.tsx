import React, { useCallback, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { useGraphStore } from '../store/useStore';
import { useAnalysisRunner } from '../hooks/useAnalysisRunner';
import type { DuplicateCopy, DuplicateReport } from '../types/duplicates';
import { DuplicateGroupCard } from './panels/DuplicateGroupCard';
import { ErrorBanner, PanelCard, PanelHeader, StatTile } from './panels/PanelParts';
import { findNodeForFile, sortGroups } from './panels/duplicatesUtils';

interface DuplicatesPanelProps {
  projectPath: string;
}

const requestDuplicates = async (projectPath: string): Promise<DuplicateReport> => {
  if (!window.api?.findDuplicates) {
    throw new Error('Duplicate finder not available in IPC');
  }
  const response = await window.api.findDuplicates(projectPath);
  if (!response.success) throw new Error(response.error || 'Unknown error');
  return response.data;
};

interface ReportViewProps {
  report: DuplicateReport;
  isSelectable: (copy: DuplicateCopy) => boolean;
  onSelect: (copy: DuplicateCopy) => void;
}

const ReportView: React.FC<ReportViewProps> = ({ report, isSelectable, onSelect }) => {
  const { t } = useTranslation();
  const groups = useMemo(() => sortGroups(report.groups), [report.groups]);
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        <StatTile label={t('duplicates.groupsCount')} value={report.totalGroups} />
        <StatTile
          label={t('duplicates.duplicatedLines')}
          value={report.duplicatedLines}
          valueClassName="text-(--red)"
        />
      </div>

      {groups.length === 0 ? (
        <PanelCard className="p-6 text-center text-[13px] text-(--t2)">
          {t('duplicates.empty')}
        </PanelCard>
      ) : (
        <div className="space-y-3">
          {groups.map((group) => (
            <DuplicateGroupCard
              key={group.id}
              group={group}
              isSelectable={isSelectable}
              onSelect={onSelect}
            />
          ))}
        </div>
      )}

      {report.omittedGroups > 0 && (
        <div className="text-center text-[12px] text-(--t3)">
          {t('duplicates.omitted', { count: report.omittedGroups })}
        </div>
      )}
    </div>
  );
};

export const DuplicatesPanel: React.FC<DuplicatesPanelProps> = ({ projectPath }) => {
  const { t } = useTranslation();
  const { graphData, setSelectedNode } = useGraphStore();
  const { isRunning, result, error, run } = useAnalysisRunner<DuplicateReport>();
  const nodes = graphData?.nodes;

  const nodeFor = useCallback(
    (copy: DuplicateCopy) => (nodes ? findNodeForFile(nodes, copy.file) : null),
    [nodes]
  );
  const isSelectable = useCallback((copy: DuplicateCopy) => nodeFor(copy) !== null, [nodeFor]);
  const handleSelect = useCallback(
    (copy: DuplicateCopy) => {
      const node = nodeFor(copy);
      if (node) setSelectedNode(node);
    },
    [nodeFor, setSelectedNode]
  );

  const handleAnalyze = () => run(() => requestDuplicates(projectPath), t('duplicates.error'));

  return (
    <div className="space-y-4 p-4">
      <PanelHeader
        eyebrow={t('tools.quickActions.cleanup')}
        title={t('duplicates.title')}
        description={t('tools.quickActions.duplicatesDescription')}
      />

      <PanelCard className="flex items-center justify-between gap-3 p-4">
        <div className="text-[13px] text-(--t2)">{t('duplicates.hint')}</div>
        <button
          type="button"
          onClick={handleAnalyze}
          disabled={isRunning}
          className="shrink-0 rounded-xl bg-(--acc) px-4 py-2.5 text-sm font-semibold text-(--bg0) transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {isRunning ? t('duplicates.analyzing') : t('duplicates.analyze')}
        </button>
      </PanelCard>

      {error && <ErrorBanner className="px-4 py-3 text-sm text-(--red)">{error}</ErrorBanner>}

      {result && <ReportView report={result} isSelectable={isSelectable} onSelect={handleSelect} />}
    </div>
  );
};
