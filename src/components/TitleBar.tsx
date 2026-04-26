import React from 'react';
import { useTranslation } from 'react-i18next';
import { useStore } from '../store/useStore';

const TitleBar: React.FC = () => {
  const { t } = useTranslation();
  const openProject = useStore(state => state.openProject);
  const closeProject = useStore(state => state.closeProject);
  const setMcpSettingsOpen = useStore(state => state.setMcpSettingsOpen);
  const toggleToolsPanel = useStore(state => state.toggleToolsPanel);
  const isToolsPanelOpen = useStore(state => state.isToolsPanelOpen);
  const graphData = useStore(state => state.graphData);

  return (
    <div 
      style={{ 
        display: 'flex', 
        alignItems: 'center', 
        justifyContent: 'space-between',
        height: '48px',
        background: 'var(--bg1)',
        borderBottom: '1px solid var(--border)',
        padding: '0 16px',
        WebkitAppRegion: 'drag',
        userSelect: 'none',
        flexShrink: 0
      } as React.CSSProperties}
    >
      {/* Left side */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '20px', WebkitAppRegion: 'no-drag', height: '100%' } as React.CSSProperties}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', cursor: 'pointer' }}>
          <div style={{ width: 28, height: 28, background: 'linear-gradient(135deg, var(--acc), var(--cyan))', borderRadius: 6, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--bg0)' }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M13 2 4 14h6l-1 8 9-12h-6l1-8z"/></svg>
          </div>
          <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--acc)', fontFamily: 'var(--font-family)' }}>CodeMaps</div>
        </div>
        
        <div style={{ display: 'flex', gap: '6px', alignItems: 'center', marginLeft: 20 }}>
          <button className="btn-glass" onClick={openProject}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M5 19a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2h4l2 2h7a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5z"/></svg>
            {t('titleBar.openProject')}
          </button>
          
          {graphData && (
            <button className="btn-glass" onClick={closeProject} style={{ color: 'var(--danger)' }}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
              {t('titleBar.closeProject')}
            </button>
          )}

          <button className="btn-glass" onClick={() => setMcpSettingsOpen(true)}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="3"></circle><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"></path></svg>
            {t('titleBar.mcpSettings')}
          </button>

          {graphData && (
            <button className={`btn-glass ${isToolsPanelOpen ? 'active' : ''}`} onClick={toggleToolsPanel} style={isToolsPanelOpen ? { background: 'var(--acc)', color: 'var(--bg0)' } : {}}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"/></svg>
              {t('titleBar.tools', { defaultValue: 'Tools' })}
            </button>
          )}
        </div>
      </div>

      {/* Right side */}
      <div style={{ display: 'flex', alignItems: 'center', height: '100%', WebkitAppRegion: 'no-drag' } as React.CSSProperties}>
        {/* Window buttons (Windows) */}
        <div style={{ display: 'flex', WebkitAppRegion: 'no-drag', height: '100%', alignItems: 'center' } as React.CSSProperties}>
          <div 
            className="window-control"
            style={{ width: '46px', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: 'var(--t1)' }} 
            onClick={() => window.api.minimize?.()}
          >
            <svg width="10" height="10" viewBox="0 0 10 10"><path d="M 0,5 L 10,5" stroke="currentColor" strokeWidth="1"/></svg>
          </div>
          <div 
            className="window-control"
            style={{ width: '46px', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: 'var(--t1)' }} 
            onClick={() => window.api.maximize?.()}
          >
            <svg width="10" height="10" viewBox="0 0 10 10"><path d="M 0,0 L 10,0 L 10,10 L 0,10 Z" fill="none" stroke="currentColor" strokeWidth="1"/></svg>
          </div>
          <div 
            className="window-control close"
            style={{ width: '46px', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: 'var(--t1)', transition: 'background-color 0.1s' }} 
            onClick={() => window.api.close?.()}
          >
            <svg width="10" height="10" viewBox="0 0 10 10"><path d="M 0,0 L 10,10 M 10,0 L 0,10" stroke="currentColor" strokeWidth="1"/></svg>
          </div>
        </div>
      </div>
    </div>
  );
};

export default TitleBar;
