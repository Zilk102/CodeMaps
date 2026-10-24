// Modal panel that hosts the analysis tools and their overview tab for the open project.
import React, { useMemo, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { PRImpactPanel } from './PRImpactPanel';
import { BlastRadiusV2Panel } from './BlastRadiusV2Panel';
import { ActivityHeatmap } from './ActivityHeatmap';
import { DecompositionWizardPanel } from './DecompositionWizardPanel';
import { DuplicatesPanel } from './DuplicatesPanel';
import { ToolsOverview } from './panels/ToolsOverview';
import { ToolsTabBar } from './panels/ToolsTabBar';
import {
  buildScenarioCards,
  buildTabs,
  buildWorkflowSteps,
  projectDisplayName,
  type ScenarioCard,
  type WorkflowStep,
  type WorkspaceTab,
} from './panels/toolsPanelData';
import { useUIStore } from '../store/useStore';

interface ToolsPanelProps {
  projectPath: string;
}

/** Cross icon of the close button. */
const CloseIcon: React.FC = () => (
  <svg
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    className="h-5 w-5"
  >
    <path d="M18 6 6 18" />
    <path d="m6 6 12 12" />
  </svg>
);

/** Closes the panel when Escape is pressed anywhere in the window. */
function useCloseOnEscape(onClose: () => void) {
  useEffect(() => {
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleEsc);
    return () => window.removeEventListener('keydown', handleEsc);
  }, [onClose]);
}

/**
 * Panel heading with the project name chip, the description of the active tab and a close button.
 */
const ToolsHeader: React.FC<{
  projectName: string;
  description: string;
  onClose: () => void;
}> = ({ projectName, description, onClose }) => {
  const { t } = useTranslation();
  return (
    <div className="flex shrink-0 items-center justify-between px-6 py-4 border-b border-(--border) bg-(--bg0)">
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-3">
          <h2 className="text-[18px] font-semibold text-(--t0) tracking-tight">
            {t('tools.workspace')}
          </h2>
          <div className="inline-flex max-w-full items-center rounded-full border border-(--border) bg-(--bg2) px-2.5 py-1 text-[11px] text-(--t2)">
            <span className="truncate">{projectName}</span>
          </div>
        </div>
        <div className="mt-1.5 text-[13px] text-(--t2) leading-relaxed">{description}</div>
      </div>
      <button
        type="button"
        onClick={onClose}
        className="ml-4 inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-(--t2) transition-colors hover:bg-(--bg2) hover:text-(--t0)"
        aria-label={t('tools.closeWorkspace')}
        title={t('tools.closeWorkspace')}
      >
        <CloseIcon />
      </button>
    </div>
  );
};

/**
 * Scrollable body that shows the overview or the tool selected in the tab bar, for the given
 * project.
 */
const ToolsTabPanel: React.FC<{
  activeTab: WorkspaceTab;
  projectPath: string;
  projectName: string;
  scenarioCards: ScenarioCard[];
  workflowSteps: WorkflowStep[];
  onOpenTool: (tab: WorkspaceTab) => void;
}> = ({ activeTab, projectPath, projectName, scenarioCards, workflowSteps, onOpenTool }) => (
  <div
    role="tabpanel"
    id={`tabpanel-${activeTab}`}
    aria-labelledby={`tab-${activeTab}`}
    className="min-h-0 flex-1 overflow-y-auto bg-(--bg1)"
  >
    {activeTab === 'overview' && (
      <ToolsOverview
        projectName={projectName}
        projectPath={projectPath}
        scenarioCards={scenarioCards}
        workflowSteps={workflowSteps}
        onOpenTool={onOpenTool}
      />
    )}
    {activeTab === 'blast' && <BlastRadiusV2Panel projectPath={projectPath} />}
    {activeTab === 'decomposition' && <DecompositionWizardPanel projectPath={projectPath} />}
    {activeTab === 'duplicates' && <DuplicatesPanel projectPath={projectPath} />}
    {activeTab === 'heatmap' && <ActivityHeatmap projectPath={projectPath} />}
    {activeTab === 'pr' && <PRImpactPanel projectPath={projectPath} />}
  </div>
);

/**
 * Tools workspace opened from the title bar, drawn as a modal over the app. Escape or a click
 * outside closes it; the tab bar switches between the overview and the blast radius,
 * decomposition, duplicates, heatmap and PR impact tools.
 */
export const ToolsPanel: React.FC<ToolsPanelProps> = ({ projectPath }) => {
  const { t } = useTranslation();
  const { activeTab, setActiveTab, toggleToolsPanel } = useUIStore();
  const projectName = useMemo(() => projectDisplayName(projectPath), [projectPath]);

  const tabs = useMemo(() => buildTabs(t), [t]);
  const scenarioCards = useMemo(() => buildScenarioCards(t), [t]);
  const workflowSteps = useMemo(() => buildWorkflowSteps(t), [t]);

  const activeTabMeta = tabs.find((tab) => tab.id === activeTab) || tabs[0];

  useCloseOnEscape(toggleToolsPanel);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6 bg-black/40 backdrop-blur-sm transition-all duration-300"
      onClick={toggleToolsPanel}
    >
      <div
        className="relative w-full max-w-4xl max-h-[90vh] flex flex-col bg-(--bg1) rounded-xl border border-(--border) shadow-2xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <ToolsHeader
          projectName={projectName}
          description={activeTabMeta.description}
          onClose={toggleToolsPanel}
        />

        <ToolsTabBar tabs={tabs} activeTab={activeTab} onSelect={setActiveTab} />

        <ToolsTabPanel
          activeTab={activeTab}
          projectPath={projectPath}
          projectName={projectName}
          scenarioCards={scenarioCards}
          workflowSteps={workflowSteps}
          onOpenTool={setActiveTab}
        />
      </div>
    </div>
  );
};
