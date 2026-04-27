import React, { useState, useRef, useEffect, Suspense, useCallback } from 'react';
import { useTranslation } from 'react-i18next';

const FileTree = React.lazy(() =>
  import('./components/FileTree').then((m) => ({ default: m.FileTree }))
);
const GraphView = React.lazy(() =>
  import('./components/GraphView').then((m) => ({ default: m.GraphView }))
);
const RecentProjects = React.lazy(() =>
  import('./components/RecentProjects').then((m) => ({ default: m.RecentProjects }))
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
const ToolsPanel = React.lazy(() =>
  import('./components/ToolsPanel').then((m) => ({ default: m.ToolsPanel }))
);

import TitleBar from './components/TitleBar';
import LanguageSwitcher from './components/LanguageSwitcher';
import PersistenceStatus from './components/PersistenceStatus';
import ErrorBoundary from './components/ErrorBoundary';
import { useStore, useUIStore, useGraphStore, useConnectionStore } from './store/useStore';

const LazyFallback: React.FC = () => {
  const { t } = useTranslation();
  return (
    <div className="w-full h-full bg-[var(--bg0)] flex items-center justify-center text-[var(--t2)]">
      {t('app.loading')}
    </div>
  );
};

const App: React.FC = () => {
  const { t } = useTranslation();
  const { sidebarWidth, setSidebarWidth, isToolsPanelOpen, parsingProgress } = useUIStore();
  const { graphData } = useGraphStore();
  const { initializeWatcher, initializeWebSocket, fetchGraph } = useConnectionStore();
  const [isDraggingState, setIsDraggingState] = useState(false);
  const isDragging = useRef(false);
  const [dragOver, setDragOver] = useState(false);
  const dragCounter = useRef(0);

  useEffect(() => {
    initializeWatcher();
    initializeWebSocket();

    const handleMouseMove = (e: MouseEvent) => {
      if (!isDragging.current) return;
      e.preventDefault();
      
      // Calculate responsive max width (e.g. 80% of screen for small screens, 50vw for large screens)
      const isMobile = window.innerWidth <= 768;
      const maxAllowedWidth = isMobile ? window.innerWidth * 0.8 : window.innerWidth - 300;
      
      const newWidth = Math.max(200, Math.min(e.clientX, maxAllowedWidth));
      setSidebarWidth(newWidth);
    };

    const handleMouseUp = () => {
      if (isDragging.current) {
        isDragging.current = false;
        setIsDraggingState(false);
        document.body.style.cursor = 'default';
      }
    };
    
    const handleResize = () => {
      // Auto-collapse or adjust sidebar on window resize
      const isMobile = window.innerWidth <= 768;
      const maxAllowedWidth = isMobile ? window.innerWidth * 0.8 : window.innerWidth - 300;
      const currentWidth = useStore.getState().sidebarWidth;
      setSidebarWidth(Math.min(currentWidth, maxAllowedWidth));
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
    window.addEventListener('resize', handleResize);

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
      window.removeEventListener('resize', handleResize);
    };
  }, [initializeWatcher, initializeWebSocket, setSidebarWidth]);

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
      const entry = item.webkitGetAsEntry?.() || ('getAsEntry' in item ? (item as unknown as { getAsEntry: () => FileSystemEntry | null }).getAsEntry() : null);
      if (!entry) return null;

      if (entry.isDirectory) {
        // Use FileSystemDirectoryEntry path if available
        if ('fullPath' in entry) {
          // In Electron, we can use the path property from the file object
          const file = item.getAsFile();
          if (file && 'path' in file) {
            // For directories dropped from OS, the path points to the directory
            return (file as unknown as { path: string }).path;
          }
        }
        // Fallback: read directory name, can't get full path securely from web API alone
        return null;
      }

      // If a file was dropped, try to use its parent directory
      const file = item.getAsFile();
      if (file && 'path' in file) {
        const path = (file as unknown as { path: string }).path;
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
    <ErrorBoundary>
      <div
        onDragOver={handleDragOver}
        onDragEnter={handleDragEnter}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        className="flex flex-col w-screen h-screen overflow-hidden bg-[var(--bg0)]"
      >
        <TitleBar />
        <Suspense fallback={<LazyFallback />}>
          <UpdateNotification />
        </Suspense>
        
        <div className="flex flex-1 overflow-hidden relative">
          {/* Left Panel */}
          <div
            className="flex flex-col h-full bg-[var(--bg1)] border-r border-[var(--border)] transition-[width] duration-200 ease-in-out"
            style={{
              width: sidebarWidth,
              minWidth: 200,
              maxWidth: window.innerWidth <= 768 ? '80vw' : '50vw',
              position: window.innerWidth <= 768 ? 'absolute' : 'relative',
              zIndex: window.innerWidth <= 768 ? 20 : 1,
              ...(isDraggingState ? { transition: 'none' } : {})
            }}
          >
          <Suspense fallback={<LazyFallback />}>
            <FileTree />
          </Suspense>
        </div>

        {/* Splitter (Drag Handle) */}
        <div
          onMouseDown={() => {
            isDragging.current = true;
            setIsDraggingState(true);
            document.body.style.cursor = 'col-resize';
          }}
          className="absolute h-full w-2 cursor-col-resize bg-transparent hover:bg-[var(--acc)] hover:opacity-30 transition-all"
          style={{
            zIndex: window.innerWidth <= 768 ? 21 : 10,
            left: sidebarWidth - 4,
          }}
        />

        {/* Main Area */}
        <div className="flex-1 relative min-w-0 bg-[var(--bg0)]">
          <Suspense fallback={<LazyFallback />}>
            {graphData ? <GraphView /> : <RecentProjects />}
          </Suspense>
        </div>

        {/* Right Panel (Tools) */}
        {graphData && isToolsPanelOpen && (
          <Suspense fallback={<LazyFallback />}>
            <ToolsPanel projectPath={graphData.projectRoot} />
          </Suspense>
        )}
      </div>

      {/* Drag & Drop Overlay */}
      <Suspense fallback={null}>
        <DragDropZone isActive={dragOver} />
      </Suspense>

      {/* Parsing Progress */}
      {parsingProgress && (
        <div
          className="absolute bottom-5 right-5 bg-[var(--bg1)] p-4 rounded-lg border border-[var(--border)] shadow-[0_4px_12px_rgba(0,0,0,0.1)] z-[1000] flex flex-col gap-2 min-w-[250px]"
        >
          <div className="flex justify-between items-center">
            <span className="font-bold">
              {t(`indexing.status.${parsingProgress.status}`, { defaultValue: 'Indexing...' })}
            </span>
            <span>{Math.round((parsingProgress.current / parsingProgress.total) * 100)}%</span>
          </div>
          <div className="w-full h-1 bg-[var(--bg2)] rounded-sm overflow-hidden">
            <div
              className="h-full bg-[var(--acc)] transition-[width] duration-300 ease-in-out"
              style={{
                width: `${(parsingProgress.current / parsingProgress.total) * 100}%`,
              }}
            />
          </div>
          {parsingProgress.filename && (
            <div
              className="text-xs text-[var(--t2)] whitespace-nowrap overflow-hidden text-ellipsis"
              title={parsingProgress.filename}
            >
              {parsingProgress.filename}
            </div>
          )}
        </div>
      )}

      <Suspense fallback={<LazyFallback />}>
        <McpSettingsModal />
      </Suspense>

      <PersistenceStatus />
      
      <LanguageSwitcher />
    </div>
    </ErrorBoundary>
  );
};

export default App;
