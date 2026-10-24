/**
 * The blocks of the Documentation tab: the per-language coverage bars, the files with the most
 * gaps, and the list of symbols that still need a comment. Every file or symbol is a button that
 * selects the file in the graph.
 */
import React from 'react';
import { useTranslation } from 'react-i18next';
import type { FileSelectionHandlers } from '../../hooks/useFileSelection';
import type {
  DocumentationLanguageItem,
  DocumentationOffenderItem,
  DocumentationSymbolItem,
} from '../../types/documentation';
import { PanelCard } from './PanelParts';
import {
  barWidth,
  coverageColor,
  languageLabel,
  sortLanguages,
  symbolLabel,
} from './documentationUtils';
import { shortenPath } from './duplicatesUtils';

export type { FileSelectionHandlers as FileSelection };

const FILE_BUTTON =
  'min-w-0 break-all rounded-lg border border-(--border) bg-(--bg1) px-2.5 py-1 text-left font-mono text-[12px] text-(--t1) transition-colors enabled:hover:border-(--acc) enabled:hover:text-(--acc) disabled:cursor-default disabled:opacity-60';

interface FileButtonProps extends FileSelectionHandlers {
  file: string;
  label: string;
}

/** A file path as a button that selects the file in the graph; disabled when it is not there. */
const FileButton: React.FC<FileButtonProps> = ({ file, label, isSelectable, onSelect }) => {
  const { t } = useTranslation();
  const selectable = isSelectable(file);
  return (
    <button
      type="button"
      onClick={() => onSelect(file)}
      disabled={!selectable}
      title={selectable ? t('documentation.selectFile') : t('documentation.notInGraph')}
      className={FILE_BUTTON}
    >
      {label}
    </button>
  );
};

/** A titled card; the title is the i18n key of its heading. */
const SectionCard: React.FC<{ titleKey: string; children: React.ReactNode }> = ({
  titleKey,
  children,
}) => {
  const { t } = useTranslation();
  return (
    <PanelCard className="space-y-3 p-4">
      <div className="text-[12px] font-semibold uppercase tracking-[0.12em] text-(--t3)">
        {t(titleKey)}
      </div>
      {children}
    </PanelCard>
  );
};

const CoverageBar: React.FC<{ percent: number }> = ({ percent }) => (
  <div className="h-2 w-full overflow-hidden rounded-full bg-(--bg1)">
    <div
      className="h-full rounded-full"
      style={{ width: barWidth(percent), backgroundColor: coverageColor(percent) }}
    />
  </div>
);

/** One bar per language with its coverage and file count. */
export const LanguageBars: React.FC<{ languages: DocumentationLanguageItem[] }> = ({
  languages,
}) => {
  const { t } = useTranslation();
  return (
    <SectionCard titleKey="documentation.byLanguage">
      {sortLanguages(languages).map((language) => (
        <div key={language.language} className="space-y-1">
          <div className="flex items-baseline justify-between gap-3 text-[12px]">
            <span className="font-medium text-(--t0)">{languageLabel(language.language)}</span>
            <span className="text-(--t3)">
              {t('documentation.filesCount', { count: language.files })} · {language.coverage}%
            </span>
          </div>
          <CoverageBar percent={language.coverage} />
        </div>
      ))}
    </SectionCard>
  );
};

/** The files with the most undocumented symbols, worst first. */
export const OffenderList: React.FC<
  { offenders: DocumentationOffenderItem[] } & FileSelectionHandlers
> = ({ offenders, ...selection }) => {
  const { t } = useTranslation();
  return (
    <SectionCard titleKey="documentation.topOffenders">
      <ul className="space-y-1.5">
        {offenders.map((offender) => (
          <li key={offender.file} className="flex flex-wrap items-center gap-2">
            <FileButton file={offender.file} label={shortenPath(offender.file)} {...selection} />
            <span className="text-[12px] text-(--t3)">
              {t('documentation.missingCount', {
                missing: offender.missing,
                required: offender.required,
              })}
            </span>
          </li>
        ))}
      </ul>
    </SectionCard>
  );
};

/** Undocumented symbols, each with what its comment must state. */
export const SymbolList: React.FC<
  { symbols: DocumentationSymbolItem[] } & FileSelectionHandlers
> = ({ symbols, ...selection }) => {
  const { t } = useTranslation();
  return (
    <SectionCard titleKey="documentation.symbols">
      <ul className="space-y-2">
        {symbols.map((symbol) => (
          <li key={`${symbol.file}:${symbol.line}:${symbol.name}`} className="space-y-1">
            <div className="flex flex-wrap items-center gap-2">
              <FileButton file={symbol.file} label={symbolLabel(symbol)} {...selection} />
              <span className="text-[11px] uppercase tracking-wider text-(--t3)">
                {symbol.kind}
              </span>
            </div>
            <p className="text-[12px] leading-5 text-(--t2)">
              {t('documentation.hintLabel')}: {symbol.hint}
            </p>
          </li>
        ))}
      </ul>
    </SectionCard>
  );
};

/** The files that open without a header comment. */
export const HeaderList: React.FC<{ files: string[] } & FileSelectionHandlers> = ({
  files,
  ...selection
}) => (
  <SectionCard titleKey="documentation.headersList">
    <ul className="flex flex-wrap gap-1.5">
      {files.map((file) => (
        <li key={file}>
          <FileButton file={file} label={shortenPath(file)} {...selection} />
        </li>
      ))}
    </ul>
  </SectionCard>
);
