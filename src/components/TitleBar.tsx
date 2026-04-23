import React from 'react';
import { useStore } from '../store/useStore';

const TitleBar: React.FC = () => {
  const openProject = useStore(state => state.openProject);
  const closeProject = useStore(state => state.closeProject);
  const setMcpSettingsOpen = useStore(state => state.setMcpSettingsOpen);
  const graphData = useStore(state => state.graphData);

  return (
    <div
      style={{
        height: '40px',
        width: '100%',
        backgroundColor: 'var(--glass-bg)',
        backdropFilter: 'blur(10px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        userSelect: 'none',
        WebkitAppRegion: 'drag', // Make it draggable
        color: 'var(--text-primary)',
        fontSize: '13px',
        borderBottom: '1px solid var(--glass-border)',
        boxSizing: 'border-box',
        paddingLeft: '15px'
      } as React.CSSProperties}
    >
      {/* Левая часть */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '20px', WebkitAppRegion: 'no-drag', height: '100%' } as any}>
        <div style={{ fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--text-primary)', fontSize: '14px' }}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"></path><polyline points="3.27 6.96 12 12.01 20.73 6.96"></polyline><line x1="12" y1="22.08" x2="12" y2="12"></line></svg>
          CodeMaps
        </div>
        
        <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
          <button className="btn-glass" onClick={openProject}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M2 12h4l3-9 5 18 3-9h5"/></svg>
            Открыть проект
          </button>
          
          {graphData && (
            <button className="btn-glass" onClick={closeProject} style={{ color: 'var(--danger)' }}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
              Закрыть проект
            </button>
          )}

          <button className="btn-glass" onClick={() => setMcpSettingsOpen(true)}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="3"></circle><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"></path></svg>
            MCP Настройки
          </button>
        </div>
      </div>

      {/* Правая часть */}
      <div style={{ display: 'flex', alignItems: 'center', height: '100%', WebkitAppRegion: 'no-drag' } as any}>
        {/* Window controls */}
        <div style={{ display: 'flex', height: '100%' }}>
          <div 
            className="window-control"
            style={{ padding: '0 15px', display: 'flex', alignItems: 'center', cursor: 'pointer', height: '100%' }}
            onClick={() => (window as any).api.minimize()}
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="5" y1="12" x2="19" y2="12"></line></svg>
          </div>
          <div 
            className="window-control"
            style={{ padding: '0 15px', display: 'flex', alignItems: 'center', cursor: 'pointer', height: '100%' }}
            onClick={() => (window as any).api.maximize()}
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect></svg>
          </div>
          <div 
            className="window-control close"
            style={{ padding: '0 15px', display: 'flex', alignItems: 'center', cursor: 'pointer', height: '100%' }}
            onClick={() => (window as any).api.close()}
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
          </div>
        </div>
      </div>
    </div>
  );
};

export default TitleBar;