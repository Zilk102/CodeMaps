import React from 'react';
import { useTranslation } from 'react-i18next';
import { useGraphStore, useUIStore, useConnectionStore } from '../store/useStore';

const windowControlStyle: React.CSSProperties = {
  width: '46px',
  height: '100%',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  cursor: 'pointer',
  color: 'var(--t1)',
  background: 'transparent',
  border: 'none',
  padding: 0,
};

const TitleBar: React.FC = () => {
  const { t } = useTranslation();
  const { openProject } = useConnectionStore();
  const { closeProject, graphData } = useGraphStore();
  const { setMcpSettingsOpen, toggleToolsPanel, isToolsPanelOpen } = useUIStore();
  const projectName = graphData?.projectRoot.split(/[/\\]/).filter(Boolean).pop();

  return (
    <div
      className="flex h-[56px] shrink-0 items-center justify-between border-b border-(--border) bg-(--bg1)/98 px-3 text-(--t1)"
      style={{ WebkitAppRegion: 'drag', userSelect: 'none' } as React.CSSProperties}
    >
      <div
        className="flex min-w-0 items-center gap-3"
        style={{ WebkitAppRegion: 'no-drag', height: '100%' } as React.CSSProperties}
      >
        <div className="flex min-w-0 items-center gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-[rgba(255,255,255,0.08)] bg-[linear-gradient(135deg,var(--acc),var(--cyan))] text-(--bg0)">
            <svg
              width="16"
              height="16"
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
          <div className="min-w-0">
            <div className="text-[16px] font-semibold tracking-[-0.02em] text-(--t0)">CodeMaps</div>
            <div className="text-[11px] text-(--t3)">
              {graphData ? t('titleBar.projectLoaded') : t('titleBar.noProject')}
            </div>
          </div>
        </div>

        {graphData && <div className="hidden h-8 w-px bg-(--border) lg:block" />}

        {graphData && (
          <div className="hidden min-w-0 items-center gap-2 xl:flex">
            <div className="status-chip min-w-0">
              <span className="status-dot" style={{ background: 'var(--acc)' }} />
              <span className="truncate">{projectName}</span>
            </div>
            <div className="status-chip">
              <span className="text-(--acc)">{t('titleBar.analysisReady')}</span>
            </div>
          </div>
        )}

        <div className="flex items-center gap-2">
          <button className="btn-glass btn-primary" onClick={openProject}>
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M5 19a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2h4l2 2h7a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5z" />
            </svg>
            {t('titleBar.openProject')}
          </button>

          {graphData && (
            <button className="btn-glass btn-danger" onClick={closeProject}>
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
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
              strokeWidth="2"
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
                strokeWidth="2"
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
        {graphData && (
          <div className="hidden max-w-[320px] items-center gap-2 rounded-full border border-(--border) bg-(--bg2)/90 px-3 py-1.5 md:flex">
            <div className="section-label">{t('titleBar.project')}</div>
            <div className="truncate text-[11px] text-(--t2)" title={graphData.projectRoot}>
              {graphData.projectRoot}
            </div>
          </div>
        )}

        <div
          className="flex h-full items-center"
          style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
        >
          <button
            type="button"
            className="window-control"
            style={windowControlStyle}
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
            style={windowControlStyle}
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
            style={{ ...windowControlStyle, transition: 'background-color 0.1s' }}
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
