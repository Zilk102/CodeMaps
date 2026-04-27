import React, { useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { PRImpactPanel } from './PRImpactPanel';
import { BlastRadiusV2Panel } from './BlastRadiusV2Panel';
import { ActivityHeatmap } from './ActivityHeatmap';
import { useUIStore } from '../store/useStore';

interface ToolsPanelProps {
  projectPath: string;
}

export const ToolsPanel: React.FC<ToolsPanelProps> = ({ projectPath }) => {
  const { t } = useTranslation();
  const { activeTab, setActiveTab } = useUIStore();
  const tabRefs = useRef<(HTMLButtonElement | null)[]>([]);

  const tabs = [
    { id: 'blast', label: t('tools.blastRadius') },
    { id: 'heatmap', label: t('tools.heatmap') },
    { id: 'pr', label: t('tools.prImpact') },
  ];

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
      setActiveTab(tabs[nextIndex].id as 'blast' | 'heatmap' | 'pr');
    }
  };

  return (
    <div
      className="flex flex-col h-full bg-[var(--bg1)] md:w-[350px] min-w-[300px] max-w-[100vw] w-full absolute md:relative right-0 bottom-0 z-15 md:z-1 overflow-hidden shadow-[0_-4px_12px_rgba(0,0,0,0.15)] md:shadow-none border-t md:border-t-0 border-l-0 md:border-l border-[var(--border)]"
    >
      <div
        role="tablist"
        aria-label="Tools"
        className="flex border-b border-[var(--border)] bg-[var(--bg2)]"
      >
        {tabs.map((tab, index) => {
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              ref={(el) => { tabRefs.current[index] = el; }}
              role="tab"
              aria-selected={isActive}
              aria-controls={`tabpanel-${tab.id}`}
              id={`tab-${tab.id}`}
              tabIndex={isActive ? 0 : -1}
              onClick={() => setActiveTab(tab.id as 'blast' | 'heatmap' | 'pr')}
              onKeyDown={(e) => handleKeyDown(e, index)}
              className={`flex-1 px-2 py-3 text-[13px] border-b-2 outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--acc)] transition-colors ${
                isActive
                  ? 'bg-[var(--bg1)] border-[var(--acc)] text-[var(--acc)] font-semibold'
                  : 'bg-transparent border-transparent text-[var(--t2)] font-normal hover:text-[var(--t0)]'
              }`}
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
        className="flex-1 overflow-y-auto"
      >
        {activeTab === 'blast' && <BlastRadiusV2Panel projectPath={projectPath} />}
        {activeTab === 'heatmap' && <ActivityHeatmap projectPath={projectPath} />}
        {activeTab === 'pr' && <PRImpactPanel projectPath={projectPath} />}
      </div>
    </div>
  );
};
