import React, { useState, useRef, useEffect, Suspense, useCallback } from 'react';
import { useTranslation } from 'react-i18next';

const FileTree = React.lazy(() =>
  import('./components/FileTree').then((m) => ({ default: m.FileTree }))
);
const GraphView = React.lazy(() =>
  import('./components/GraphView').then((m) => ({ default: m.GraphView }))
);
const McpSettingsModal = React.lazy(() =>
  import('./components/McpSettingsModal').then((m) => ({ default: m.McpSettingsModal }))
);
const UpdateNotification = React.lazy(() =>
  import('./components/UpdateNotification')
);
const DragDropZone = React.lazy(() =>
  import('./components/DragDropZone').then((m) => ({ default: m.default }))
);

import TitleBar from './components/TitleBar';
import LanguageSwitcher from './components/LanguageSwitcher';
import { useStore } from './store/useStore';

const LazyFallback: React.FC = () => {
  const { t } = useTranslation();
  return (
    <div
      style={{
        width: '100%',
        height: '100%',
        background: 'var(--bg0)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        color: 'var(--t2)',
      }}
    >
      {t('app.loading')}
    </div>
  );
};

const App: React.FC = () => {
  const [sidebarWidth, setSidebarWidth] = useState(320);
  const isDragging = useRef(false);
  const [dragOver, setDragOver] = useState(false);
  const dragCounter = useRef(0);

  const initializeWatcher = useStore((state) => state.initializeWatcher);
  const initializeWebSocket = useStore((state) => state.initializeWebSocket);
  const parsingProgress = useStore((state) => state.parsingProgress);
  const fetchGraph = useStore((state) => state.fetchGraph);

  useEffect(() => {
    initializeWatcher();
    initializeWebSocket();

    const handleMouseMove = (e: MouseEvent) => {
      if (!isDragging.current) return;
      e.preventDefault();
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

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  }, []);

  const handleDragEnter = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounter.current += 1;
    setDragOver(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounter.current -= 1;
    if (dragCounter.current === 0) {
      setDragOver(false);
    }
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounter.current = 0;
    setDragOver(false);

    const items = e.dataTransfer.items;
    if (!items || items.length === 0) return;

    // Look for directory entries
    const getPathFromItem = async (item: DataTransferItem) => {
      const entry = item.webkitGetAsEntry?.() || (item as any).getAsEntry?.();
      if (!entry) return null;

      if (entry.isDirectory) {
        // Use FileSystemDirectoryEntry path if available
        if ((entry as any).fullPath) {
          // In Electron, we can use the path property from the file object
          const file = item.getAsFile();
          if (file && (file as any).path) {
            // For directories dropped from OS, the path points to the directory
            return (file as any).path;
          }
        }
        // Fallback: read directory name, can't get full path securely from web API alone
        return null;
      }

      // If a file was dropped, try to use its parent directory
      const file = item.getAsFile();
      if (file && (file as any).path) {
        const path = (file as any).path as string;
        return path.substring(0, path.lastIndexOf('/')) || path.substring(0, path.lastIndexOf('\\'));
      }

      return null;
    };

    // Try to find a directory path from dropped items
    const processDrop = async () => {
      for (let i = 0; i < items.length; i++) {
        const item = items[i];
        const path = await getPathFromItem(item);
        if (path) {
          await fetchGraph(path);
          return;
        }
      }
    };

    processDrop().catch(console.error);
  }, [fetchGraph]);

  return (
    <div
      onDragOver={handleDragOver}
      onDragEnter={handleDragEnter}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      style={{
        display: 'flex',
        flexDirection: 'column',
        width: '100vw',
        height: '100vh',
        overflow: 'hidden',
        backgroundColor: 'var(--bg0)',
      }}
    >
      <TitleBar />
      <Suspense fallback={<LazyFallback />}>
        <UpdateNotification />
      </Suspense>
      
      <div style={{ display: 'flex', flex: 1, overflow: 'hidden', position: 'relative' }}>
        {/* Левая панель */}
        <div
          style={{
            width: sidebarWidth,
            minWidth: 200,
            maxWidth: '50vw',
            height: '100%',
            display: 'flex',
            flexDirection: 'column',
            backgroundColor: 'var(--bg1)',
            borderRight: '1px solid var(--border)',
          }}
        >
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
          onMouseEnter={(e) => {
            e.currentTarget.style.background = 'var(--acc)';
            e.currentTarget.style.opacity = '0.3';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = 'transparent';
            e.currentTarget.style.opacity = '1';
          }}
        />

        {/* Граф */}
        <div style={{ flex: 1, position: 'relative', minWidth: 0, backgroundColor: 'var(--bg0)' }}>
          <Suspense fallback={<LazyFallback />}>
            <GraphView />
          </Suspense>
        </div>
      </div>

      {/* Drag & Drop Overlay */}
      <Suspense fallback={null}>
        <DragDropZone isActive={dragOver} />
      </Suspense>

      {/* Прогресс парсинга */}
      {parsingProgress && (
        <div
          style={{
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
            fontFamily: 'var(--font-family)',
          }}
        >
          <div style={{ color: 'var(--acc)' }}>{parsingProgress.status}</div>
          <div
            style={{
              width: 150,
              height: 6,
              background: 'var(--bg3)',
              borderRadius: 3,
              overflow: 'hidden',
            }}
          >
            <div
              style={{
                width: `${(parsingProgress.current / parsingProgress.total) * 100}%`,
                height: '100%',
                background: 'var(--acc)',
                transition: 'width 0.1s linear',
              }}
            />
          </div>
          <div
            style={{
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              maxWidth: 300,
              marginRight: 10,
              color: 'var(--t3)',
            }}
          >
            {parsingProgress.filename}
          </div>
          <div style={{ color: 'var(--t1)' }}>
            {parsingProgress.current} / {parsingProgress.total}
          </div>
        </div>
      )}

      <Suspense fallback={<LazyFallback />}>
        <McpSettingsModal />
      </Suspense>
      
      <LanguageSwitcher />
    </div>
  );
};

export default App;
