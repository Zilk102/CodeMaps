import React from 'react';

const TitleBar: React.FC = () => {
  return (
    <div
      style={{
        height: '35px',
        width: '100%',
        backgroundColor: '#181a1f',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        userSelect: 'none',
        WebkitAppRegion: 'drag', // Make it draggable
        color: '#ccc',
        fontSize: '13px',
        borderBottom: '1px solid #222',
        boxSizing: 'border-box',
        paddingLeft: '10px'
      } as React.CSSProperties}
    >
      {/* Левая часть */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '15px', WebkitAppRegion: 'no-drag', paddingLeft: '5px' }}>
        <div style={{ fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: '5px', color: '#ccc' }}>
          CodeMaps
        </div>
      </div>

      {/* Правая часть */}
      <div style={{ display: 'flex', alignItems: 'center', height: '100%', WebkitAppRegion: 'no-drag' }}>
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