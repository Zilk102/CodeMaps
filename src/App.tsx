import React, { useState, useRef, useEffect } from 'react';
import { FileTree } from './components/FileTree';
import { GraphView } from './components/GraphView';
import TitleBar from './components/TitleBar';
import { McpSettingsModal } from './components/McpSettingsModal';
import { useStore } from './store/useStore';

const App: React.FC = () => {
  const [sidebarWidth, setSidebarWidth] = useState(320);
  const isDragging = useRef(false);
  const initializeWatcher = useStore(state => state.initializeWatcher);
  const parsingProgress = useStore(state => state.parsingProgress);

  useEffect(() => {
    initializeWatcher();
    
    const handleMouseMove = (e: MouseEvent) => {
      if (!isDragging.current) return;
      e.preventDefault(); // Предотвращаем выделение текста при ресайзе
      const newWidth = Math.max(200, Math.min(e.clientX, window.innerWidth - 300));
      setSidebarWidth(newWidth);
    };

    const handleMouseUp = () => {
      if (isDragging.current) {
        isDragging.current = false;
        document.body.style.cursor = 'default';
      }
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
    
    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, []);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', width: '100vw', height: '100vh', overflow: 'hidden', backgroundColor: '#0f111a' }}>
      <TitleBar />
      <div style={{ display: 'flex', flex: 1, overflow: 'hidden', position: 'relative' }}>
        {/* Левая панель */}
        <div style={{ width: sidebarWidth, flexShrink: 0, height: '100%' }}>
          <FileTree />
        </div>
        
        {/* Сплиттер (Drag Handle) */}
        <div
          style={{
            width: '4px',
            background: 'rgba(255,255,255,0.05)',
            cursor: 'col-resize',
            zIndex: 50,
            transition: 'background 0.2s'
          }}
          onMouseEnter={(e) => e.currentTarget.style.background = 'rgba(79, 195, 247, 0.5)'}
          onMouseLeave={(e) => e.currentTarget.style.background = 'rgba(255,255,255,0.05)'}
          onMouseDown={() => {
            isDragging.current = true;
            document.body.style.cursor = 'col-resize';
          }}
        />
        
        {/* Правая панель с Графом */}
        <div style={{ flex: 1, height: '100%', overflow: 'hidden', position: 'relative' }}>
          <GraphView />
        </div>
      </div>
      
      {parsingProgress && (
        <div style={{
          height: 24,
          background: '#1e1e1e',
          color: '#ccc',
          display: 'flex',
          alignItems: 'center',
          padding: '0 10px',
          fontSize: 12,
          borderTop: '1px solid #333',
          zIndex: 9999
        }}>
          <div style={{ marginRight: 10, fontWeight: 'bold' }}>{parsingProgress.status}</div>
          <div style={{ flex: 1, background: '#333', height: 10, borderRadius: 5, overflow: 'hidden', marginRight: 10 }}>
            <div style={{
              width: `${(parsingProgress.current / parsingProgress.total) * 100}%`,
              background: '#4fc3f7',
              height: '100%',
              transition: 'width 0.1s linear'
            }} />
          </div>
          <div style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: 300, marginRight: 10, color: '#888' }}>
            {parsingProgress.filename}
          </div>
          <div>{parsingProgress.current} / {parsingProgress.total}</div>
        </div>
      )}
      
      <McpSettingsModal />
    </div>
  );
};

export default App;
