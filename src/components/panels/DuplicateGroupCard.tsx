// Card that shows one group of duplicated code with the advice for removing it.
import React from 'react';
import { useTranslation } from 'react-i18next';
import type { DuplicateCopy, DuplicateGroup } from '../../types/duplicates';
import { BulletBox, PanelCard, ReasonLine } from './PanelParts';
import { actionLabelKey, formatCopy } from './duplicatesUtils';

const BADGE =
  'rounded-full border border-(--border) bg-[rgba(255,255,255,0.05)] px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-(--t2)';
const TEST_BADGE =
  'rounded-full border border-(--border) px-1.5 py-0.5 text-[9px] uppercase tracking-wider text-(--t3)';

interface CopyListProps {
  copies: DuplicateCopy[];
  isSelectable: (copy: DuplicateCopy) => boolean;
  onSelect: (copy: DuplicateCopy) => void;
}

/**
 * Clickable list of a group's copies as file:lines labels; copies outside the graph are disabled
 * and test files get a badge.
 */
const CopyList: React.FC<CopyListProps> = ({ copies, isSelectable, onSelect }) => {
  const { t } = useTranslation();
  return (
    <ul className="space-y-1.5">
      {copies.map((copy) => {
        const label = formatCopy(copy);
        const selectable = isSelectable(copy);
        return (
          <li key={label} className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => onSelect(copy)}
              disabled={!selectable}
              title={selectable ? t('duplicates.selectCopy') : t('duplicates.notInGraph')}
              className="min-w-0 break-all rounded-lg border border-(--border) bg-(--bg1) px-2.5 py-1 text-left font-mono text-[12px] text-(--t1) transition-colors enabled:hover:border-(--acc) enabled:hover:text-(--acc) disabled:cursor-default disabled:opacity-60"
            >
              {label}
            </button>
            {copy.test && <span className={TEST_BADGE}>{t('duplicates.test')}</span>}
          </li>
        );
      })}
    </ul>
  );
};

/** Bulleted list of how the copies of a group differ from each other. */
const DifferenceList: React.FC<{ differences: string[] }> = ({ differences }) => {
  const { t } = useTranslation();
  return (
    <BulletBox
      title={t('duplicates.differences')}
      items={differences}
      itemClassName="break-all font-mono text-[12px] text-(--t2)"
    />
  );
};

interface DuplicateGroupCardProps {
  group: DuplicateGroup;
  isSelectable: (copy: DuplicateCopy) => boolean;
  onSelect: (copy: DuplicateCopy) => void;
}

/**
 * Card for one clone group: lines times copies, the suggested refactoring and why, the file the
 * shared code could move to, every copy and the differences.
 */
export const DuplicateGroupCard: React.FC<DuplicateGroupCardProps> = ({
  group,
  isSelectable,
  onSelect,
}) => {
  const { t } = useTranslation();
  const { suggestion } = group;
  return (
    <PanelCard className="flex flex-col gap-3 p-4">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-[14px] font-semibold text-(--t0)">
          {t('duplicates.linesTimesCopies', {
            lines: group.lineCount,
            copies: group.copies.length,
          })}
        </span>
        <span className={BADGE}>{t(actionLabelKey(suggestion.action))}</span>
      </div>

      <ReasonLine label={t('duplicates.reason')} reason={suggestion.reason} />

      {suggestion.targetFile && (
        <div className="break-all font-mono text-[12px] text-(--t3)">
          {t('duplicates.targetFile')}: {suggestion.targetFile}
        </div>
      )}

      <CopyList copies={group.copies} isSelectable={isSelectable} onSelect={onSelect} />

      {group.differences.length > 0 && <DifferenceList differences={group.differences} />}
    </PanelCard>
  );
};
