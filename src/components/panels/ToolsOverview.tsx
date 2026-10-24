// Overview tab of the tools panel: intro, one card per tool, the project scope and a suggested
// order of use.
import React from 'react';
import { useTranslation } from 'react-i18next';
import { PanelCard } from './PanelParts';
import type { ScenarioCard, ToolTab, WorkflowStep } from './toolsPanelData';

const HOVER_CLASS = 'transition-colors hover:border-(--acc) hover:bg-[rgba(255,255,255,0.03)]';

interface ToolsOverviewProps {
  projectName: string;
  projectPath: string;
  scenarioCards: ScenarioCard[];
  workflowSteps: WorkflowStep[];
  onOpenTool: (tab: ToolTab) => void;
}

/** Card for one tool with its badge, title and description; clicking it opens that tool. */
const ScenarioCardButton: React.FC<{ card: ScenarioCard; onOpen: () => void }> = ({
  card,
  onOpen,
}) => {
  const { t } = useTranslation();
  return (
    <button
      type="button"
      onClick={onOpen}
      className={`rounded-2xl border border-(--border) bg-(--bg2) p-4 text-left ${HOVER_CLASS}`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="text-[11px] font-semibold uppercase tracking-[0.12em] text-(--t3)">
            {card.badge}
          </div>
          <div className="mt-1 text-[14px] font-semibold text-(--t0)">{card.title}</div>
          <div className="mt-2 text-[12px] leading-5 text-(--t2)">{card.description}</div>
        </div>
        <span className="rounded-full border border-(--border) bg-(--bg1) px-2.5 py-1 text-[11px] font-medium text-(--t1)">
          {t('tools.openTool')}
        </span>
      </div>
    </button>
  );
};

/** Numbered step of the suggested workflow; clicking it opens the tool for that step. */
const WorkflowStepButton: React.FC<{
  step: WorkflowStep;
  index: number;
  onOpen: () => void;
}> = ({ step, index, onOpen }) => (
  <button
    type="button"
    onClick={onOpen}
    className={`flex w-full items-start gap-3 rounded-xl border border-(--border) bg-(--bg1) px-3 py-3 text-left ${HOVER_CLASS}`}
  >
    <div className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[rgba(68,170,255,0.12)] text-[11px] font-semibold text-(--acc)">
      {index + 1}
    </div>
    <div className="min-w-0">
      <div className="text-[13px] font-semibold text-(--t0)">{step.title}</div>
      <div className="mt-1 text-[12px] leading-5 text-(--t2)">{step.description}</div>
    </div>
  </button>
);

/**
 * Content of the overview tab: a summary, tool cards, the open project's name and path, and the
 * numbered guide. onOpenTool switches to the chosen tool.
 */
export const ToolsOverview: React.FC<ToolsOverviewProps> = ({
  projectName,
  projectPath,
  scenarioCards,
  workflowSteps,
  onOpenTool,
}) => {
  const { t } = useTranslation();
  return (
    <div className="space-y-4 p-4">
      <PanelCard className="p-4">
        <div className="text-[12px] font-semibold uppercase tracking-[0.12em] text-(--t3)">
          {t('tools.workspaceSummary')}
        </div>
        <div className="mt-2 text-[16px] font-semibold text-(--t0)">
          {t('tools.workspaceHeadline')}
        </div>
        <div className="mt-2 text-[13px] leading-5 text-(--t2)">{t('tools.workspaceBody')}</div>
      </PanelCard>

      <div className="grid grid-cols-1 gap-3">
        {scenarioCards.map((card) => (
          <ScenarioCardButton key={card.id} card={card} onOpen={() => onOpenTool(card.id)} />
        ))}
      </div>

      <PanelCard className="p-4">
        <div className="text-[12px] font-semibold uppercase tracking-[0.12em] text-(--t3)">
          {t('tools.projectScope')}
        </div>
        <div className="mt-2 text-[14px] font-semibold text-(--t0)">{projectName}</div>
        <div className="mt-2 break-all text-[12px] leading-5 text-(--t2)">{projectPath}</div>
      </PanelCard>

      <PanelCard className="p-4">
        <div className="text-[12px] font-semibold uppercase tracking-[0.12em] text-(--t3)">
          {t('tools.toolGuideTitle')}
        </div>
        <div className="mt-3 space-y-2.5">
          {workflowSteps.map((step, index) => (
            <WorkflowStepButton
              key={step.id}
              step={step}
              index={index}
              onOpen={() => onOpenTool(step.id)}
            />
          ))}
        </div>
      </PanelCard>
    </div>
  );
};
