import React, { useState, useRef, useEffect } from 'react';
import { FileTree } from './components/FileTree';
import { GraphView } from './components/GraphView';
import TitleBar from './components/TitleBar';

const App: React.FC = () => {
  const [sidebarWidth, setSidebarWidth] = useState(320);
  const isDragging = useRef(false);

  useEffect(() => {
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
      <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
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
    </div>
  );
};

export default App;
