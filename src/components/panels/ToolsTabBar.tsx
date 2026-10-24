// Tab strip of the tools panel with keyboard navigation.
import React, { useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { nextTabIndex, type TabMeta, type WorkspaceTab } from './toolsPanelData';

interface ToolsTabBarProps {
  tabs: TabMeta[];
  activeTab: WorkspaceTab;
  onSelect: (tab: WorkspaceTab) => void;
}

/** Accessible tab strip with arrow-key navigation that wraps around. */
export const ToolsTabBar: React.FC<ToolsTabBarProps> = ({ tabs, activeTab, onSelect }) => {
  const { t } = useTranslation();
  const tabRefs = useRef<(HTMLButtonElement | null)[]>([]);

  const handleKeyDown = (e: React.KeyboardEvent, index: number) => {
    const nextIndex = nextTabIndex(e.key, index, tabs.length);

    if (nextIndex !== -1) {
      e.preventDefault();
      tabRefs.current[nextIndex]?.focus();
      onSelect(tabs[nextIndex].id);
    }
  };

  return (
    <div
      role="tablist"
      aria-label={t('tools.workspaceTabs')}
      className="flex shrink-0 gap-1 overflow-x-auto border-b border-(--border) bg-(--bg1) px-6 py-3"
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
            onClick={() => onSelect(tab.id)}
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
  );
};
