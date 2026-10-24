import React from 'react';
import { useTranslation } from 'react-i18next';

const noDragStyle = { WebkitAppRegion: 'no-drag' } as React.CSSProperties;

export const BrandMark: React.FC = () => (
  <div className="flex items-center gap-2">
    <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded bg-(--acc) text-(--bg0)">
      <svg
        width="14"
        height="14"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M13 2 4 14h6l-1 8 9-12h-6l1-8z" />
      </svg>
    </div>
    <div className="font-semibold text-(--t0) tracking-tight">CodeMaps</div>
  </div>
);

export const ProjectBreadcrumb: React.FC<{ projectName?: string }> = ({ projectName }) => {
  const { t } = useTranslation();
  return (
    <div className="hidden min-w-0 items-center gap-3 xl:flex text-xs">
      <div className="flex items-center gap-2 text-(--t1)">
        <span className="w-2 h-2 rounded-full bg-(--acc)" />
        <span className="truncate font-medium">{projectName}</span>
      </div>
      <span className="text-(--t3)">/</span>
      <div className="text-(--t2)">{t('titleBar.analysisReady')}</div>
    </div>
  );
};

const GEAR_PATH =
  'M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z';

const TOOLS_PATH =
  'M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z';

const ButtonIcon: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <svg
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.5"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    {children}
  </svg>
);

interface ActionProps {
  hasProject: boolean;
  isToolsPanelOpen: boolean;
  onOpenProject: () => void;
  onCloseProject: () => void;
  onOpenSettings: () => void;
  onToggleTools: () => void;
}

/** A title-bar button; below 1100px only the icon stays so the bar never overlaps the language switcher. */
const ActionButton: React.FC<{
  label: string;
  onClick: () => void;
  active?: boolean;
  children: React.ReactNode;
}> = ({ label, onClick, active = false, children }) => (
  <button
    type="button"
    className={`btn-glass ${active ? 'active' : ''}`}
    onClick={onClick}
    title={label}
    aria-label={label}
  >
    <ButtonIcon>{children}</ButtonIcon>
    <span className="hidden min-[1100px]:inline">{label}</span>
  </button>
);

export const TitleBarActions: React.FC<ActionProps> = ({
  hasProject,
  isToolsPanelOpen,
  onOpenProject,
  onCloseProject,
  onOpenSettings,
  onToggleTools,
}) => {
  const { t } = useTranslation();
  return (
    <div className="flex items-center gap-1 ml-2">
      <ActionButton label={t('titleBar.openProject')} onClick={onOpenProject}>
        <path d="M5 19a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2h4l2 2h7a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5z" />
      </ActionButton>

      {hasProject && (
        <ActionButton label={t('titleBar.closeProject')} onClick={onCloseProject}>
          <line x1="18" y1="6" x2="6" y2="18" />
          <line x1="6" y1="6" x2="18" y2="18" />
        </ActionButton>
      )}

      <ActionButton label={t('titleBar.mcpSettings')} onClick={onOpenSettings}>
        <circle cx="12" cy="12" r="3"></circle>
        <path d={GEAR_PATH}></path>
      </ActionButton>

      {hasProject && (
        <ActionButton label={t('titleBar.tools')} onClick={onToggleTools} active={isToolsPanelOpen}>
          <path d={TOOLS_PATH} />
        </ActionButton>
      )}
    </div>
  );
};

const WindowControlButton: React.FC<{
  className: string;
  label: string;
  onClick: () => void;
  children: React.ReactNode;
}> = ({ className, label, onClick, children }) => (
  <button type="button" className={className} aria-label={label} onClick={onClick}>
    <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden="true">
      {children}
    </svg>
  </button>
);

export const WindowControls: React.FC = () => {
  const { t } = useTranslation();
  return (
    <div className="flex h-full items-center" style={noDragStyle}>
      <WindowControlButton
        className="window-control"
        label={t('titleBar.minimize')}
        onClick={() => window.api.minimize?.()}
      >
        <path d="M 0,5 L 10,5" stroke="currentColor" strokeWidth="1" />
      </WindowControlButton>
      <WindowControlButton
        className="window-control"
        label={t('titleBar.maximize')}
        onClick={() => window.api.maximize?.()}
      >
        <path d="M 0,0 L 10,0 L 10,10 L 0,10 Z" fill="none" stroke="currentColor" strokeWidth="1" />
      </WindowControlButton>
      <WindowControlButton
        className="window-control close"
        label={t('titleBar.close')}
        onClick={() => window.api.close?.()}
      >
        <path d="M 0,0 L 10,10 M 10,0 L 0,10" stroke="currentColor" strokeWidth="1" />
      </WindowControlButton>
    </div>
  );
};
