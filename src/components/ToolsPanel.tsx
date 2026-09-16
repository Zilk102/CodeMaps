import React, { useMemo, useRef, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { PRImpactPanel } from './PRImpactPanel';
import { BlastRadiusV2Panel } from './BlastRadiusV2Panel';
import { ActivityHeatmap } from './ActivityHeatmap';
import { DecompositionWizardPanel } from './DecompositionWizardPanel';
import { useUIStore } from '../store/useStore';

interface ToolsPanelProps {
  projectPath: string;
}

type WorkspaceTab = 'overview' | 'blast' | 'heatmap' | 'pr' | 'decomposition';

export const ToolsPanel: React.FC<ToolsPanelProps> = ({ projectPath }) => {
  const { t } = useTranslation();
  const { activeTab, setActiveTab, toggleToolsPanel } = useUIStore();
  const tabRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const projectName = useMemo(
    () => projectPath.split(/[/\\]/).filter(Boolean).pop() || projectPath,
    [projectPath]
  );

  const tabs = useMemo(
    () => [
      {
        id: 'overview' as WorkspaceTab,
        label: t('tools.workspace'),
        eyebrow: t('tools.workspaceEyebrow'),
        description: t('tools.workspaceDescription'),
      },
      {
        id: 'blast' as WorkspaceTab,
        label: t('tools.blastRadius'),
        eyebrow: t('tools.blastRadiusEyebrow'),
        description: t('tools.blastRadiusDescription'),
      },
      {
        id: 'heatmap' as WorkspaceTab,
        label: t('tools.heatmap'),
        eyebrow: t('tools.heatmapEyebrow'),
        description: t('tools.heatmapDescription'),
      },
      {
        id: 'decomposition' as WorkspaceTab,
        label: t('tools.decomposition'),
        eyebrow: t('tools.decompositionEyebrow'),
        description: t('tools.decompositionDescription'),
      },
      {
        id: 'pr' as WorkspaceTab,
        label: t('tools.prImpact'),
        eyebrow: t('tools.prImpactEyebrow'),
        description: t('tools.prImpactDescription'),
      },
    ],
    [t]
  );

  const scenarioCards = useMemo(
    () => [
      {
        id: 'blast' as WorkspaceTab,
        title: t('tools.blastRadius'),
        badge: t('tools.quickActions.highRisk'),
        description: t('tools.quickActions.blastDescription'),
      },
      {
        id: 'decomposition' as WorkspaceTab,
        title: t('tools.decomposition'),
        badge: t('tools.quickActions.refactoring'),
        description: t('tools.quickActions.decompositionActionDescription'),
      },
      {
        id: 'pr' as WorkspaceTab,
        title: t('tools.prImpact'),
        badge: t('tools.quickActions.review'),
        description: t('tools.quickActions.prDescription'),
      },
      {
        id: 'heatmap' as WorkspaceTab,
        title: t('tools.heatmap'),
        badge: t('tools.quickActions.hotspots'),
        description: t('tools.quickActions.heatmapDescription'),
      },
    ],
    [t]
  );

  const workflowSteps = useMemo(
    () => [
      {
        id: 'blast',
        title: t('tools.blastRadius'),
        description: t('tools.quickActions.blastDescription'),
      },
      {
        id: 'decomposition',
        title: t('tools.decomposition'),
        description: t('tools.quickActions.decompositionActionDescription'),
      },
      {
        id: 'pr',
        title: t('tools.prImpact'),
        description: t('tools.quickActions.prDescription'),
      },
      {
        id: 'heatmap',
        title: t('tools.heatmap'),
        description: t('tools.quickActions.heatmapDescription'),
      },
    ],
    [t]
  );

  const handleKeyDown = (e: React.KeyboardEvent, index: number) => {
    let nextIndex = -1;
    if (e.key === 'ArrowRight') {
      nextIndex = (index + 1) % tabs.length;
    } else if (e.key === 'ArrowLeft') {
      nextIndex = (index - 1 + tabs.length) % tabs.length;
    }

    if (nextIndex !== -1) {
      e.preventDefault();
      tabRefs.current[nextIndex]?.focus();
      setActiveTab(tabs[nextIndex].id);
    }
  };

  const activeTabMeta = tabs.find((tab) => tab.id === activeTab) || tabs[0];

  // Handle Escape key to close
  useEffect(() => {
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') toggleToolsPanel();
    };
    window.addEventListener('keydown', handleEsc);
    return () => window.removeEventListener('keydown', handleEsc);
  }, [toggleToolsPanel]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6 bg-black/40 backdrop-blur-sm transition-all duration-300"
      onClick={toggleToolsPanel}
    >
      <div
        className="relative w-full max-w-4xl max-h-[90vh] flex flex-col bg-(--bg1) rounded-xl border border-(--border) shadow-2xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-6 py-4 border-b border-(--border) bg-(--bg0)">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-3">
              <h2 className="text-[18px] font-semibold text-(--t0) tracking-tight">
                {t('tools.workspace')}
              </h2>
              <div className="inline-flex max-w-full items-center rounded-full border border-(--border) bg-(--bg2) px-2.5 py-1 text-[11px] text-(--t2)">
                <span className="truncate">{projectName}</span>
              </div>
            </div>
            <div className="mt-1.5 text-[13px] text-(--t2) leading-relaxed">
              {activeTabMeta.description}
            </div>
          </div>
          <button
            type="button"
            onClick={toggleToolsPanel}
            className="ml-4 inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-(--t2) transition-colors hover:bg-(--bg2) hover:text-(--t0)"
            aria-label={t('tools.closeWorkspace')}
            title={t('tools.closeWorkspace')}
          >
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
          </button>
        </div>

        <div
          role="tablist"
          aria-label={t('tools.workspaceTabs')}
          className="flex gap-1 overflow-x-auto border-b border-(--border) bg-(--bg1) px-6 py-3"
        >
          {tabs.map((tab, index) => {
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                ref={(el) => {
                  tabRefs.current[index] = el;
                }}
                role="tab"
                aria-selected={isActive}
                aria-controls={`tabpanel-${tab.id}`}
                id={`tab-${tab.id}`}
                tabIndex={isActive ? 0 : -1}
                onClick={() => setActiveTab(tab.id)}
                onKeyDown={(e) => handleKeyDown(e, index)}
                className={`rounded-lg px-4 py-2 text-[13px] font-medium outline-none transition-all duration-200 ${
                  isActive
                    ? 'bg-(--bg2) text-(--t0) shadow-sm border border-(--border)'
                    : 'text-(--t2) hover:text-(--t1) hover:bg-(--bg2)/50 border border-transparent'
                }`}
                title={tab.eyebrow}
              >
                {tab.label}
              </button>
            );
          })}
        </div>

        <div
          role="tabpanel"
          id={`tabpanel-${activeTab}`}
          aria-labelledby={`tab-${activeTab}`}
          className="flex-1 overflow-y-auto bg-(--bg1)"
        >
          {activeTab === 'overview' && (
            <div className="space-y-4 p-4">
              <div className="rounded-2xl border border-(--border) bg-(--bg2) p-4">
                <div className="text-[12px] font-semibold uppercase tracking-[0.12em] text-(--t3)">
                  {t('tools.workspaceSummary')}
                </div>
                <div className="mt-2 text-[16px] font-semibold text-(--t0)">
                  {t('tools.workspaceHeadline')}
                </div>
                <div className="mt-2 text-[13px] leading-5 text-(--t2)">
                  {t('tools.workspaceBody')}
                </div>
              </div>

              <div className="grid grid-cols-1 gap-3">
                {scenarioCards.map((card) => (
                  <button
                    key={card.id}
                    type="button"
                    onClick={() => setActiveTab(card.id)}
                    className="rounded-2xl border border-(--border) bg-(--bg2) p-4 text-left transition-colors hover:border-(--acc) hover:bg-[rgba(255,255,255,0.03)]"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="text-[11px] font-semibold uppercase tracking-[0.12em] text-(--t3)">
                          {card.badge}
                        </div>
                        <div className="mt-1 text-[14px] font-semibold text-(--t0)">
                          {card.title}
                        </div>
                        <div className="mt-2 text-[12px] leading-5 text-(--t2)">
                          {card.description}
                        </div>
                      </div>
                      <span className="rounded-full border border-(--border) bg-(--bg1) px-2.5 py-1 text-[11px] font-medium text-(--t1)">
                        {t('tools.openTool')}
                      </span>
                    </div>
                  </button>
                ))}
              </div>

              <div className="rounded-2xl border border-(--border) bg-(--bg2) p-4">
                <div className="text-[12px] font-semibold uppercase tracking-[0.12em] text-(--t3)">
                  {t('tools.projectScope')}
                </div>
                <div className="mt-2 text-[14px] font-semibold text-(--t0)">{projectName}</div>
                <div className="mt-2 break-all text-[12px] leading-5 text-(--t2)">
                  {projectPath}
                </div>
              </div>

              <div className="rounded-2xl border border-(--border) bg-(--bg2) p-4">
                <div className="text-[12px] font-semibold uppercase tracking-[0.12em] text-(--t3)">
                  {t('tools.toolGuideTitle')}
                </div>
                <div className="mt-3 space-y-2.5">
                  {workflowSteps.map((step, index) => (
                    <button
                      key={step.id}
                      type="button"
                      onClick={() => setActiveTab(step.id as WorkspaceTab)}
                      className="flex w-full items-start gap-3 rounded-xl border border-(--border) bg-(--bg1) px-3 py-3 text-left transition-colors hover:border-(--acc) hover:bg-[rgba(255,255,255,0.03)]"
                    >
                      <div className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[rgba(68,170,255,0.12)] text-[11px] font-semibold text-(--acc)">
                        {index + 1}
                      </div>
                      <div className="min-w-0">
                        <div className="text-[13px] font-semibold text-(--t0)">{step.title}</div>
                        <div className="mt-1 text-[12px] leading-5 text-(--t2)">
                          {step.description}
                        </div>
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}
          {activeTab === 'blast' && <BlastRadiusV2Panel projectPath={projectPath} />}
          {activeTab === 'decomposition' && <DecompositionWizardPanel projectPath={projectPath} />}
          {activeTab === 'heatmap' && <ActivityHeatmap projectPath={projectPath} />}
          {activeTab === 'pr' && <PRImpactPanel projectPath={projectPath} />}
        </div>
      </div>
    </div>
  );
};
