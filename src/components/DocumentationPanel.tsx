/**
 * The Documentation tab of the Workspace panel: how much of the open project's public code carries
 * a useful comment, which languages and files lag behind, and what each missing comment must say.
 */
import React from 'react';
import { useTranslation } from 'react-i18next';
import type { DocumentationReportData } from '../types/documentation';
import {
  HeaderList,
  LanguageBars,
  OffenderList,
  SymbolList,
  type FileSelection,
} from './panels/DocumentationSections';
import { AnalysisPanel, unwrapResponse } from './panels/AnalysisPanelFrame';
import { FooterNote, PanelCard, StatTile } from './panels/PanelParts';
import { coverageTextClass } from './panels/documentationUtils';

interface DocumentationPanelProps {
  projectPath: string;
}

/** Items per list requested from the main process. */
const LIST_LIMIT = 50;

const requestDocumentation = async (projectPath: string): Promise<DocumentationReportData> => {
  if (!window.api?.checkDocumentation) {
    throw new Error('Documentation check not available in IPC');
  }
  return unwrapResponse(await window.api.checkDocumentation(projectPath, LIST_LIMIT));
};

/** Coverage tiles, language bars and the lists of what still needs a comment. */
const ReportView: React.FC<{ report: DocumentationReportData } & FileSelection> = ({
  report,
  ...selection
}) => {
  const { t } = useTranslation();
  const { undocumented, filesWithoutHeader, lowQuality } = report;
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
        <StatTile
          label={t('documentation.coverage')}
          value={`${report.coveragePercent}%`}
          valueClassName={coverageTextClass(report.coveragePercent)}
        />
        <StatTile label={t('documentation.undocumented')} value={undocumented.total} />
        <StatTile label={t('documentation.missingHeaders')} value={filesWithoutHeader.total} />
        <StatTile label={t('documentation.lowQuality')} value={lowQuality?.total ?? 0} />
      </div>

      <LanguageBars languages={report.byLanguage} />

      {undocumented.total + filesWithoutHeader.total === 0 ? (
        <PanelCard className="p-6 text-center text-[13px] text-(--t2)">
          {t('documentation.empty')}
        </PanelCard>
      ) : (
        <>
          {report.topOffenders.length > 0 && (
            <OffenderList offenders={report.topOffenders} {...selection} />
          )}
          {undocumented.items.length > 0 && (
            <SymbolList symbols={undocumented.items} {...selection} />
          )}
          {undocumented.omitted > 0 && (
            <FooterNote>{t('documentation.omitted', { count: undocumented.omitted })}</FooterNote>
          )}
          {filesWithoutHeader.files.length > 0 && (
            <HeaderList files={filesWithoutHeader.files} {...selection} />
          )}
        </>
      )}
    </div>
  );
};

/** The tab body: an analyze button, the error if any, and the report once it arrived. */
export const DocumentationPanel: React.FC<DocumentationPanelProps> = ({ projectPath }) => (
  <AnalysisPanel namespace="documentation" request={() => requestDocumentation(projectPath)}>
    {(report, selection) => <ReportView report={report} {...selection} />}
  </AnalysisPanel>
);
