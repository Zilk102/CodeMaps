// Duplicates tab of the Workspace panel: lists the clone groups of the open project with the
// suggested refactoring and lets a copy be selected in the graph.
import React, { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import type { DuplicateCopy, DuplicateReport } from '../types/duplicates';
import { DuplicateGroupCard } from './panels/DuplicateGroupCard';
import { AnalysisPanel, unwrapResponse } from './panels/AnalysisPanelFrame';
import { FooterNote, PanelCard, StatTile } from './panels/PanelParts';
import { sortGroups } from './panels/duplicatesUtils';

interface DuplicatesPanelProps {
  projectPath: string;
}

const requestDuplicates = async (projectPath: string): Promise<DuplicateReport> => {
  if (!window.api?.findDuplicates) {
    throw new Error('Duplicate finder not available in IPC');
  }
  return unwrapResponse(await window.api.findDuplicates(projectPath));
};

interface ReportViewProps {
  report: DuplicateReport;
  isSelectable: (copy: DuplicateCopy) => boolean;
  onSelect: (copy: DuplicateCopy) => void;
}

/** The finished report: totals, then one card per clone group, biggest saving first. */
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
        <FooterNote>{t('duplicates.omitted', { count: report.omittedGroups })}</FooterNote>
      )}
    </div>
  );
};

/**
 * Duplicates tool tab. Runs the clone detector on the open project and lists the groups; a copy
 * can be clicked to select its file in the graph when that file is part of it.
 */
export const DuplicatesPanel: React.FC<DuplicatesPanelProps> = ({ projectPath }) => (
  <AnalysisPanel namespace="duplicates" request={() => requestDuplicates(projectPath)}>
    {(report, { isSelectable, onSelect }) => (
      <ReportView
        report={report}
        isSelectable={(copy) => isSelectable(copy.file)}
        onSelect={(copy) => onSelect(copy.file)}
      />
    )}
  </AnalysisPanel>
);
