import React, { useState, useRef, useEffect, Suspense } from 'react';

const FileTree = React.lazy(() => import('./components/FileTree').then(m => ({ default: m.FileTree })));
const GraphView = React.lazy(() => import('./components/GraphView').then(m => ({ default: m.GraphView })));
const McpSettingsModal = React.lazy(() => import('./components/McpSettingsModal').then(m => ({ default: m.McpSettingsModal })));

import TitleBar from './components/TitleBar';
import { useStore } from './store/useStore';

const LazyFallback: React.FC = () => (
  <div style={{ width: '100%', height: '100%', background: 'var(--bg0)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--t2)' }}>
    Загрузка…
  </div>
);

const App: React.FC = () => {
  const [sidebarWidth, setSidebarWidth] = useState(320);
  const isDragging = useRef(false);
  const initializeWatcher = useStore(state => state.initializeWatcher);
  const initializeWebSocket = useStore(state => state.initializeWebSocket);
  const parsingProgress = useStore(state => state.parsingProgress);

  useEffect(() => {
    initializeWatcher();
    initializeWebSocket();
    
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
    <div style={{ display: 'flex', flexDirection: 'column', width: '100vw', height: '100vh', overflow: 'hidden', backgroundColor: 'var(--bg0)' }}>
      <TitleBar />
      <div style={{ display: 'flex', flex: 1, overflow: 'hidden', position: 'relative' }}>
        {/* Левая панель */}
        <div style={{ 
          width: sidebarWidth, 
          minWidth: 200, 
          maxWidth: '50vw',
          height: '100%', 
          display: 'flex', 
          flexDirection: 'column',
          backgroundColor: 'var(--bg1)',
          borderRight: '1px solid var(--border)'
        }}>
          <Suspense fallback={<LazyFallback />}>
            <FileTree />
          </Suspense>
        </div>
        
        {/* Сплиттер (Drag Handle) */}
        <div 
          onMouseDown={() => {
            isDragging.current = true;
            document.body.style.cursor = 'col-resize';
          }}
          style={{ 
            width: '8px', 
            cursor: 'col-resize', 
            background: 'transparent',
            zIndex: 10,
            position: 'absolute',
            left: sidebarWidth - 4,
            height: '100%',
          }} 
          onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--acc)'; e.currentTarget.style.opacity = '0.3'; }}
          onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.opacity = '1'; }}
        />
        
        {/* Граф */}
        <div style={{ flex: 1, position: 'relative', minWidth: 0, backgroundColor: 'var(--bg0)' }}>
          <Suspense fallback={<LazyFallback />}>
            <GraphView />
          </Suspense>
        </div>
      </div>
      
      {/* Прогресс парсинга */}
      {parsingProgress && (
        <div style={{
          position: 'fixed',
          bottom: 20,
          right: 20,
          background: 'var(--bg1)',
          padding: '15px 20px',
          borderRadius: 8,
          boxShadow: '0 10px 30px rgba(0,0,0,0.5)',
          border: '1px solid var(--border)',
          display: 'flex',
          alignItems: 'center',
          gap: 15,
          zIndex: 1000,
          fontFamily: 'var(--font-family)'
        }}>
          <div style={{ color: 'var(--acc)' }}>{parsingProgress.status}</div>
          <div style={{ width: 150, height: 6, background: 'var(--bg3)', borderRadius: 3, overflow: 'hidden' }}>
            <div style={{ 
              width: `${(parsingProgress.current / parsingProgress.total) * 100}%`, 
              height: '100%', 
              background: 'var(--acc)',
              transition: 'width 0.1s linear'
            }} />
          </div>
          <div style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: 300, marginRight: 10, color: 'var(--t3)' }}>
            {parsingProgress.filename}
          </div>
          <div style={{ color: 'var(--t1)' }}>{parsingProgress.current} / {parsingProgress.total}</div>
        </div>
      )}
      
      <Suspense fallback={<LazyFallback />}>
        <McpSettingsModal />
      </Suspense>
    </div>
  );
};

export default App;
