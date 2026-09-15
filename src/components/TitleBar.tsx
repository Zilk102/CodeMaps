import React from 'react';
import { useTranslation } from 'react-i18next';
import { useGraphStore, useUIStore, useConnectionStore } from '../store/useStore';

const TitleBar: React.FC = () => {
  const { t } = useTranslation();
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

        {graphData && <div className="h-4 w-px bg-(--border)" />}

        {graphData && (
          <div className="hidden min-w-0 items-center gap-3 xl:flex text-xs">
            <div className="flex items-center gap-2 text-(--t1)">
              <span className="w-2 h-2 rounded-full bg-(--acc)" />
              <span className="truncate font-medium">{projectName}</span>
            </div>
            <span className="text-(--t3)">/</span>
            <div className="text-(--t2)">{t('titleBar.analysisReady')}</div>
          </div>
        )}

        <div className="flex items-center gap-1 ml-2">
          <button className="btn-glass" onClick={openProject}>
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M5 19a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2h4l2 2h7a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5z" />
            </svg>
            {t('titleBar.openProject')}
          </button>

          {graphData && (
            <button className="btn-glass" onClick={closeProject}>
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </svg>
              {t('titleBar.closeProject')}
            </button>
          )}

          <button className="btn-glass" onClick={() => setMcpSettingsOpen(true)}>
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <circle cx="12" cy="12" r="3"></circle>
              <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"></path>
            </svg>
            {t('titleBar.mcpSettings')}
          </button>

          {graphData && (
            <button
              className={`btn-glass ${isToolsPanelOpen ? 'active' : ''}`}
              onClick={toggleToolsPanel}
            >
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z" />
              </svg>
              {t('titleBar.tools')}
            </button>
          )}
        </div>
      </div>

      <div
        className="flex items-center gap-2"
        style={{ height: '100%', WebkitAppRegion: 'no-drag' } as React.CSSProperties}
      >
        <div
          className="flex h-full items-center"
          style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
        >
          <button
            type="button"
            className="window-control"
            aria-label={t('titleBar.minimize')}
            onClick={() => window.api.minimize?.()}
          >
            <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden="true">
              <path d="M 0,5 L 10,5" stroke="currentColor" strokeWidth="1" />
            </svg>
          </button>
          <button
            type="button"
            className="window-control"
            aria-label={t('titleBar.maximize')}
            onClick={() => window.api.maximize?.()}
          >
            <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden="true">
              <path
                d="M 0,0 L 10,0 L 10,10 L 0,10 Z"
                fill="none"
                stroke="currentColor"
                strokeWidth="1"
              />
            </svg>
          </button>
          <button
            type="button"
            className="window-control close"
            aria-label={t('titleBar.close')}
            onClick={() => window.api.close?.()}
          >
            <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden="true">
              <path d="M 0,0 L 10,10 M 10,0 L 0,10" stroke="currentColor" strokeWidth="1" />
            </svg>
          </button>
        </div>
      </div>
    </div>
  );
};

export default TitleBar;
