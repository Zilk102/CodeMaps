// Custom window title bar: brand, project breadcrumb, action buttons, language switcher and window
// controls.
import React from 'react';
import LanguageSwitcher from './LanguageSwitcher';
import { useGraphStore, useUIStore, useConnectionStore } from '../store/useStore';
import { BrandMark, ProjectBreadcrumb, TitleBarActions, WindowControls } from './TitleBarParts';

/**
 * Draggable top bar of the frameless window. It offers open/close project, MCP settings and the
 * tools-panel toggle, and shows the name of the open project.
 */
const TitleBar: React.FC = () => {
  const { openProject } = useConnectionStore();
  const { closeProject, graphData } = useGraphStore();
  const { setMcpSettingsOpen, toggleToolsPanel, isToolsPanelOpen } = useUIStore();
  const projectName = graphData?.projectRoot.split(/[/\\]/).filter(Boolean).pop();

  return (
    <div
      className="flex h-[48px] shrink-0 items-center justify-between border-b border-(--border) bg-(--bg0) px-4 text-(--t1)"
      style={{ WebkitAppRegion: 'drag', userSelect: 'none' } as React.CSSProperties}
    >
      <div
        className="flex min-w-0 items-center gap-4"
        style={{ WebkitAppRegion: 'no-drag', height: '100%' } as React.CSSProperties}
      >
        <BrandMark />

        {graphData && <div className="h-4 w-px bg-(--border)" />}

        {graphData && <ProjectBreadcrumb projectName={projectName} />}

        <TitleBarActions
          hasProject={Boolean(graphData)}
          isToolsPanelOpen={isToolsPanelOpen}
          onOpenProject={openProject}
          onCloseProject={closeProject}
          onOpenSettings={() => setMcpSettingsOpen(true)}
          onToggleTools={toggleToolsPanel}
        />
      </div>

      <div
        className="flex items-center gap-3"
        style={{ height: '100%', WebkitAppRegion: 'no-drag' } as React.CSSProperties}
      >
        <LanguageSwitcher />
        <WindowControls />
      </div>
    </div>
  );
};

export default TitleBar;
